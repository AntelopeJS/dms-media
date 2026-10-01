// Hot reload ownership (AntelopeJS/dms-media#26).
//
// Runs a real project with `@antelopejs/core`'s `launch` in watch mode: two
// consumer modules declared BEFORE dms-media declare an AssetType field at load
// time, one through `@antelopejs/interface-dms-media`, one through the
// deprecated `@antelopejs/dms-media` re-export. Then it reloads a consumer and
// dms-media itself, and checks that dms-media's routes, permissions, page and
// category stay owned by dms-media, survive the consumer's reload, and are
// evaluated again from the edited file when dms-media reloads.
//
// Expects `pnpm run build` to have run: it loads the module from `dist`.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { launch } = require("@antelopejs/core");
const { MongoMemoryReplSet } = require("mongodb-memory-server-core");

const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const PERMISSIONS_FILE = path.join(PACKAGE_ROOT, "dist", "permissions.js");
function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

const API_PORT = await findFreePort();
const BASE_URL = `http://127.0.0.1:${API_PORT}`;
const JWT_SECRET = "reload-test-secret";
const MONGO_BINARY_VERSION = "8.0.8";
const RELOAD_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 100;
const HTTP_UNAUTHORIZED = 401;
const HTTP_BAD_REQUEST = 400;
const MEDIA_MODULE = "dms-media";
const CONSUMER_MODULE = "consumer";
const LEGACY_CONSUMER_MODULE = "legacy-consumer";
const UPLOAD_PERMISSION = "media.upload";
const ORIGINAL_UPLOAD_TITLE = "Upload media";
const EDITED_UPLOAD_TITLE = "Upload media (reloaded)";
const CONSUMER_BINDING = "reload-probe.cover";
const CONSUMER_FOLDER = "Reload probe covers";
const LEGACY_BINDING = "reload-probe.legacy";
const OWNER = {
  name: "Reload Owner",
  email: "reload-owner@test.local",
  password: "TestPassw0rd!",
};
// What a module declaring DMS pages depends on anyway, as template-dms-demo does.
const CONSUMER_INTERFACES = {
  "@antelopejs/interface-api": ">=0.0.13 <1.0.0",
  "@antelopejs/interface-core": ">=0.1.1 <1.0.0",
  "@antelopejs/interface-dms": ">=0.2.8 <1.0.0",
};
const COUNTER_ID_PATTERN = /^\d+$/;
const MEDIA_ID_PATTERN = /^(media|settings\.media)(\.|$)/;
const RUNTIME = Symbol.for("@antelopejs/interface-core/runtime");

function consumerSource(specifier, bindingId, folderName, revision) {
  return `const { AssetType } = require("${specifier}");

exports.coverField = new AssetType({
  mimetypes: ["image/*"],
  binding: { id: "${bindingId}", folderName: "${folderName}" },
});
exports.construct = () => {};
exports.start = () => {};
exports.stop = () => {};
exports.destroy = () => {};
// revision ${revision}
`;
}

async function writeConsumer(folder, manifest, source) {
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(
    path.join(folder, "package.json"),
    JSON.stringify({ version: "1.0.0", main: "index.js", ...manifest }),
  );
  await fs.writeFile(path.join(folder, "index.js"), source);
}

// Stands in for the npm copy a consumer installs: the manifest and the
// `exports` target, nothing of the module itself.
async function installLegacyDependency(folder) {
  const target = path.join(folder, "node_modules", "@antelopejs", "dms-media");
  await fs.mkdir(path.join(target, "dist"), { recursive: true });
  await fs.copyFile(
    path.join(PACKAGE_ROOT, "package.json"),
    path.join(target, "package.json"),
  );
  await fs.copyFile(
    path.join(PACKAGE_ROOT, "dist", "public.js"),
    path.join(target, "dist", "public.js"),
  );
}

function packageSource(name, version) {
  return { source: { type: "package", package: name, version } };
}

function projectConfig(mongoUrl, storagePath) {
  return {
    name: "dms-media-reload-test",
    cacheFolder: path.join(PACKAGE_ROOT, ".antelope", "cache"),
    logging: { channelFilter: { "*": "error" } },
    modules: {
      [LEGACY_CONSUMER_MODULE]: {
        source: { type: "local", path: "./legacy-consumer", main: "index.js" },
      },
      [CONSUMER_MODULE]: {
        source: { type: "local", path: "./consumer", main: "index.js" },
      },
      [MEDIA_MODULE]: {
        source: { type: "local", path: PACKAGE_ROOT, watchDir: ["dist"] },
        config: {},
      },
      dms: {
        ...packageSource("@antelopejs/dms", ">=0.5.0 <1.0.0"),
        config: { auth: { jwtSecret: JWT_SECRET } },
      },
      mongodb: {
        ...packageSource("@antelopejs/mongodb", "1.3.1"),
        config: { url: mongoUrl, database: "dms-media-reload-test" },
      },
      "auth-jwt": {
        ...packageSource("@antelopejs/auth-jwt", "1.0.3"),
        config: { secret: JWT_SECRET },
      },
      api: {
        ...packageSource("@antelopejs/api", "1.3.1"),
        config: {
          servers: [{ protocol: "http", host: "127.0.0.1", port: API_PORT }],
          publicBaseUrl: BASE_URL,
        },
      },
      "file-storage-local": {
        ...packageSource("@antelopejs/file-storage-local", "0.1.5"),
        config: {
          storagePath,
          baseUrl: BASE_URL,
          defaultVisibility: "private",
        },
      },
      nodemailer: {
        ...packageSource("@antelopejs/nodemailer", "0.0.5"),
        config: { host: "127.0.0.1", port: 1, secure: false },
      },
    },
  };
}

function registeringEntries() {
  const entries = [];
  for (const [identity, state] of globalThis[RUNTIME].proxyStates) {
    if (state.kind !== "registering") continue;
    for (const [id, entry] of state.value.registered) {
      entries.push({ identity, id, ...entry });
    }
  }
  return entries;
}

function findEntry(id) {
  return registeringEntries().find((entry) => entry.id === id);
}

function ownedBy(module) {
  return registeringEntries().filter((entry) => entry.module === module);
}

// Routes register under a running counter and pages under their class, so
// only named ids are stable across generations: the others count by kind.
function stableId(id) {
  if (typeof id !== "string") return typeof id;
  return COUNTER_ID_PATTERN.test(id) ? "counter" : id;
}

function registrationKeys(entries) {
  return entries
    .map((entry) => `${entry.identity} ${stableId(entry.id)}`)
    .sort();
}

function isMediaId(id) {
  return typeof id === "string" && MEDIA_ID_PATTERN.test(id);
}

function ownersOf(entries) {
  return new Set(entries.map((entry) => entry.owner));
}

async function waitFor(description, predicate) {
  const deadline = Date.now() + RELOAD_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

function request(pathname, init = {}) {
  return fetch(`${BASE_URL}${pathname}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-antelopejs-namespace": "default",
      ...init.headers,
    },
  });
}

async function mediaTreeStatus() {
  return (await request("/api/media/tree")).status;
}

async function ownerToken() {
  const registration = await request("/api/onboarding/register", {
    method: "POST",
    body: JSON.stringify(OWNER),
  });
  // 400 once the owner exists: onboarding only runs on an empty instance.
  assert.ok(
    registration.status <= HTTP_BAD_REQUEST,
    `onboarding answered ${registration.status}`,
  );
  const login = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: OWNER.email, password: OWNER.password }),
  });
  assert.ok(login.status < HTTP_BAD_REQUEST, `login answered ${login.status}`);
  return (await login.json()).access_token;
}

describe("hot reload keeps dms-media's registrations with dms-media", () => {
  let mongo;
  let projectFolder;
  let manager;
  let originalPermissions;
  let consumerIndex;
  let initialMediaKeys;

  before(async () => {
    originalPermissions = await fs.readFile(PERMISSIONS_FILE, "utf8");
    assert.ok(
      originalPermissions.includes(`"${ORIGINAL_UPLOAD_TITLE}"`),
      "dist/permissions.js is built",
    );
    mongo = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
      binary: { version: MONGO_BINARY_VERSION },
    });
    projectFolder = await fs.mkdtemp(
      path.join(os.tmpdir(), "dms-media-reload-"),
    );
    const storagePath = path.join(projectFolder, "storage");
    await fs.mkdir(storagePath);

    consumerIndex = path.join(projectFolder, "consumer", "index.js");
    await writeConsumer(
      path.join(projectFolder, "consumer"),
      {
        name: "reload-consumer",
        dependencies: {
          ...CONSUMER_INTERFACES,
          "@antelopejs/interface-dms-media": ">=0.1.0 <1.0.0",
        },
      },
      consumerSource(
        "@antelopejs/interface-dms-media",
        CONSUMER_BINDING,
        CONSUMER_FOLDER,
        1,
      ),
    );
    const legacyFolder = path.join(projectFolder, "legacy-consumer");
    await writeConsumer(
      legacyFolder,
      {
        name: "reload-legacy-consumer",
        dependencies: { ...CONSUMER_INTERFACES, "@antelopejs/dms-media": "*" },
      },
      consumerSource("@antelopejs/dms-media", LEGACY_BINDING, "Legacy", 1),
    );
    await installLegacyDependency(legacyFolder);

    const config = projectConfig(mongo.getUri(), storagePath);
    await fs.writeFile(
      path.join(projectFolder, "antelope.config.ts"),
      `export default ${JSON.stringify(config, null, 2)};\n`,
    );
    manager = await launch(projectFolder, "default", { watch: true });
  });

  after(async () => {
    await fs.writeFile(PERMISSIONS_FILE, originalPermissions);
    if (manager) {
      await manager.stopAll();
      await manager.destroyAll();
    }
    await mongo?.stop();
    if (projectFolder) {
      await fs.rm(projectFolder, { recursive: true, force: true });
    }
  });

  it("owns its registrations even when consumers load first", async () => {
    assert.equal(await mediaTreeStatus(), HTTP_UNAUTHORIZED);
    const upload = findEntry(UPLOAD_PERMISSION);
    assert.equal(upload?.module, MEDIA_MODULE);
    assert.equal(upload.args[0].title, ORIGINAL_UPLOAD_TITLE);
    initialMediaKeys = registrationKeys(ownedBy(MEDIA_MODULE));
    assert.ok(
      initialMediaKeys.length > 0,
      "dms-media registered its routes, pages and permissions",
    );
    const mediaIds = registeringEntries().filter((entry) =>
      isMediaId(entry.id),
    );
    assert.ok(mediaIds.length > 0);
    assert.deepEqual(
      new Set(mediaIds.map((entry) => entry.module)),
      new Set([MEDIA_MODULE]),
    );
    assert.equal(findEntry(CONSUMER_BINDING)?.module, CONSUMER_MODULE);
    assert.equal(findEntry(LEGACY_BINDING)?.module, LEGACY_CONSUMER_MODULE);
  });

  it("keeps routes, permissions and pages through a consumer reload", async () => {
    const consumerOwner = findEntry(CONSUMER_BINDING).owner;
    const mediaOwners = ownersOf(ownedBy(MEDIA_MODULE));
    await fs.writeFile(
      consumerIndex,
      consumerSource(
        "@antelopejs/interface-dms-media",
        CONSUMER_BINDING,
        CONSUMER_FOLDER,
        2,
      ),
    );
    await waitFor("the consumer to reload", () => {
      const binding = findEntry(CONSUMER_BINDING);
      return Boolean(binding && binding.owner !== consumerOwner);
    });

    assert.equal(await mediaTreeStatus(), HTTP_UNAUTHORIZED);
    assert.deepEqual(registrationKeys(ownedBy(MEDIA_MODULE)), initialMediaKeys);
    assert.deepEqual(ownersOf(ownedBy(MEDIA_MODULE)), mediaOwners);
  });

  it("re-registers everything from the edited files on its own reload", async () => {
    const mediaOwners = ownersOf(ownedBy(MEDIA_MODULE));
    await fs.writeFile(
      PERMISSIONS_FILE,
      originalPermissions.replace(
        `"${ORIGINAL_UPLOAD_TITLE}"`,
        `"${EDITED_UPLOAD_TITLE}"`,
      ),
    );
    await waitFor(
      "dms-media to register the edited permission",
      () => findEntry(UPLOAD_PERMISSION)?.args[0].title === EDITED_UPLOAD_TITLE,
    );

    assert.equal(await mediaTreeStatus(), HTTP_UNAUTHORIZED);
    const mediaEntries = ownedBy(MEDIA_MODULE);
    assert.deepEqual(registrationKeys(mediaEntries), initialMediaKeys);
    const reloadedOwners = ownersOf(mediaEntries);
    assert.equal(reloadedOwners.size, 1);
    assert.ok(!mediaOwners.has([...reloadedOwners][0]), "a new generation");
  });

  it("replays the consumers' bindings to the reloaded generation", async () => {
    const token = await ownerToken();
    const tree = await request("/api/media/tree", {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.ok(tree.ok, `tree answered ${tree.status}`);
    const { folders } = await tree.json();
    const names = folders.map((folder) => folder.name);
    assert.ok(names.includes(CONSUMER_FOLDER), names.join(", "));
    assert.ok(names.includes("Legacy"), names.join(", "));
  });
});
