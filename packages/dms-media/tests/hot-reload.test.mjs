/**
 * Hot reload ownership (AntelopeJS/dms-media#26).
 *
 * Runs a real project with `@antelopejs/core`'s `launch` in watch mode: two
 * consumer modules declared BEFORE dms-media declare an AssetType field at load
 * time through `@antelopejs/interface-dms-media`. Then it reloads the consumer
 * and dms-media itself, and checks that dms-media's routes, pages and page
 * topics stay owned by dms-media, survive the consumer's reload, and are
 * evaluated again from the edited file when dms-media reloads.
 *
 * Expects `pnpm run build` to have run: it loads the module from `dist`.
 */

import { launch } from "@antelopejs/core";
import { MongoMemoryReplSet } from "mongodb-memory-server-core";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const CONSTANTS_FILE = path.join(PACKAGE_ROOT, "dist", "constants.js");

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isString(value) {
  return typeof value === "string";
}

/** @returns {Promise<number>} */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || isString(address)) {
        reject(new Error("The server did not bind a TCP port"));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

const API_PORT = await findFreePort();
const BASE_URL = `http://127.0.0.1:${API_PORT}`;
const JWT_SECRET = "reload-test-secret";
const HTML_RENDER_SECRET = "test-html-render-secret";
const MONGO_BINARY_VERSION = "8.0.8";
const RELOAD_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 100;
const HTTP_UNAUTHORIZED = 401;
const HTTP_BAD_REQUEST = 400;
const MEDIA_MODULE = "dms-media";
const CONSUMER_MODULE = "consumer";
const ORIGINAL_TOPIC = "media.library";
const EDITED_TOPIC = "media.library.reloaded";
const FILES_PAGE_PERMISSION = "modules.media.library.files";
const CONSUMER_BINDING = "reload-probe.cover";
const CONSUMER_FOLDER = "Reload probe covers";
const OWNER = {
  firstName: "Reload",
  lastName: "Owner",
  email: "reload-owner@test.local",
  password: "TestPassw0rd!",
};
/** What a module declaring DMS pages depends on anyway, as template-dms-demo does. */
const CONSUMER_INTERFACES = {
  "@antelopejs/interface-api": ">=0.0.13 <1.0.0",
  "@antelopejs/interface-core": ">=0.2.3 <1.0.0",
  "@antelopejs/interface-dms": ">=0.9.0 <1.0.0",
};
const COUNTER_ID_PATTERN = /^\d+$/;
const MEDIA_ID_PATTERN = /^(media|modules\.media|settings\.media)(\.|$)/;
const RUNTIME = Symbol.for("@antelopejs/interface-core/runtime");
const PROXY_BRAND = Symbol.for("@antelopejs/interface-core/proxy");

/**
 * @param {string} specifier
 * @param {string} bindingId
 * @param {string} folderName
 * @param {number} revision
 */
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

/**
 * @param {string} folder
 * @param {Record<string, unknown>} manifest
 * @param {string} source
 */
async function writeConsumer(folder, manifest, source) {
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(
    path.join(folder, "package.json"),
    JSON.stringify({ version: "1.0.0", main: "index.js", ...manifest }),
  );
  await fs.writeFile(path.join(folder, "index.js"), source);
}

/**
 * Stands in for the npm copy a consumer installs: the manifest and the
 * `exports` target, nothing of the module itself.
 *
 * @param {string} name
 * @param {string} version
 */
function packageSource(name, version) {
  return { source: { type: "package", package: name, version } };
}

/**
 * @param {string} mongoUrl
 * @param {string} storagePath
 */
function projectConfig(mongoUrl, storagePath) {
  return {
    name: "dms-media-reload-test",
    cacheFolder: path.join(PACKAGE_ROOT, ".antelope", "cache"),
    logging: { channelFilter: { "*": "error" } },
    modules: {
      [CONSUMER_MODULE]: {
        source: { type: "local", path: "./consumer", main: "index.js" },
      },
      [MEDIA_MODULE]: {
        source: { type: "local", path: PACKAGE_ROOT, watchDir: ["dist"] },
        config: {},
      },
      dms: {
        ...packageSource("@antelopejs/dms", ">=0.11.0 <1.0.0"),
        config: {
          /** No frontend server runs here: the dashboard URL is the API. */
          clientBaseUrl: BASE_URL,
          auth: { jwtSecret: JWT_SECRET },
          /** Outside development, dms 0.10 refuses to start without a render secret. */
          htmlRender: { serviceSecret: HTML_RENDER_SECRET },
        },
      },
      mongodb: {
        ...packageSource("@antelopejs/mongodb", "1.5.0"),
        config: { url: mongoUrl, database: "dms-media-reload-test" },
      },
      "auth-jwt": {
        ...packageSource("@antelopejs/auth-jwt", "1.0.3"),
        config: { secret: JWT_SECRET },
      },
      api: {
        ...packageSource("@antelopejs/api", "1.5.0"),
        config: {
          servers: [{ protocol: "http", host: "127.0.0.1", port: API_PORT }],
          publicBaseUrl: BASE_URL,
        },
      },
      "file-storage-local": {
        ...packageSource("@antelopejs/file-storage-local", "0.1.13"),
        config: {
          storagePath,
          baseUrl: BASE_URL,
          defaultVisibility: "private",
        },
      },
      nodemailer: {
        ...packageSource("@antelopejs/nodemailer", "0.0.6"),
        config: { host: "127.0.0.1", port: 1, secure: false },
      },
    },
  };
}

/** A registration id: a name, or a counter, a class or an options object known by its kind. */
const registrationIdSchema = z.union([
  z.string(),
  z.number().transform(() => ({ kind: "number" })),
  z.instanceof(Function).transform(() => ({ kind: "function" })),
  z
    .object({})
    .passthrough()
    .transform(() => ({ kind: "object" })),
]);
const registeredSchema = z.map(
  registrationIdSchema,
  z.object({ module: z.string().optional(), owner: z.string().optional() }),
);
const brandSchema = z.object({ identity: z.string() });
const proxySchema = z.object({ registered: registeredSchema });
const runtimeSchema = z.object({ registeringProxies: z.set(z.unknown()) });
const topicPairSchema = z.tuple([z.string(), z.string()]);
const loginAnswerSchema = z.object({ access_token: z.string() });
const treeAnswerSchema = z.object({
  folders: z.array(z.object({ name: z.string() })),
});

/**
 * @typedef {object} Registration
 * @property {string} identity
 * @property {z.infer<typeof registrationIdSchema>} id
 * @property {string | undefined} module
 * @property {string | undefined} owner
 */

/**
 * The entries of every registering proxy: interface-core 0.2 keeps each
 * registering proxy's entries on the proxy.
 *
 * @returns {Registration[]}
 */
function registeringEntries() {
  const { registeringProxies } = runtimeSchema.parse(
    Object.getOwnPropertyDescriptor(globalThis, RUNTIME)?.value,
  );
  /** @type {Registration[]} */
  const entries = [];
  for (const proxy of registeringProxies) {
    const { identity } = brandSchema.parse(
      Object.getOwnPropertyDescriptor(proxy, PROXY_BRAND)?.value,
    );
    for (const [id, entry] of proxySchema.parse(proxy).registered) {
      entries.push({ identity, id, module: entry.module, owner: entry.owner });
    }
  }
  return entries;
}

/** @param {Registration["id"]} id */
function findEntry(id) {
  return registeringEntries().find((entry) => entry.id === id);
}

/**
 * A page topic registers under its [page, topic] pair, serialized.
 *
 * @param {Registration["id"] | undefined} id
 * @returns {[string, string] | undefined}
 */
function pageTopicPair(id) {
  if (!isString(id) || !id.startsWith("[")) return undefined;
  return topicPairSchema.parse(JSON.parse(id));
}

/** @returns {Registration | undefined} */
function findFilesPageTopic() {
  return registeringEntries().find(
    (entry) => pageTopicPair(entry.id)?.[0] === FILES_PAGE_PERMISSION,
  );
}

/** @param {string} module */
function ownedBy(module) {
  return registeringEntries().filter((entry) => entry.module === module);
}

/**
 * Routes register under a running counter and pages under their class, so
 * only named ids are stable across generations: the others count by kind. A
 * page topic counts by its page, the topic itself being what the test edits.
 *
 * @param {Registration["id"]} id
 */
function stableId(id) {
  if (!isString(id)) return id.kind;
  const topicPair = pageTopicPair(id);
  if (topicPair) return `topic of ${topicPair[0]}`;
  return COUNTER_ID_PATTERN.test(id) ? "counter" : id;
}

/** @param {Registration[]} entries */
function registrationKeys(entries) {
  return entries
    .map((entry) => `${entry.identity} ${stableId(entry.id)}`)
    .sort();
}

/** @param {Registration["id"]} id */
function isMediaId(id) {
  const key = pageTopicPair(id)?.[0] ?? id;
  return isString(key) && MEDIA_ID_PATTERN.test(key);
}

/** @param {Registration[]} entries */
function ownersOf(entries) {
  return new Set(entries.map((entry) => entry.owner));
}

/**
 * @param {string} description
 * @param {() => boolean | Promise<boolean>} predicate
 */
async function waitFor(description, predicate) {
  const deadline = Date.now() + RELOAD_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

/**
 * @param {string} pathname
 * @param {{ method?: string, body?: string, headers?: Record<string, string> }} [init]
 */
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

/**
 * Registers the owner, then logs in. Onboarding answers 400 once the owner
 * exists, since it only runs on an empty instance.
 */
async function ownerToken() {
  const registration = await request("/api/onboarding/register", {
    method: "POST",
    body: JSON.stringify(OWNER),
  });
  assert.ok(
    registration.status <= HTTP_BAD_REQUEST,
    `onboarding answered ${registration.status}`,
  );
  const login = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: OWNER.email, password: OWNER.password }),
  });
  assert.ok(login.status < HTTP_BAD_REQUEST, `login answered ${login.status}`);
  return loginAnswerSchema.parse(await login.json()).access_token;
}

void describe("hot reload keeps dms-media's registrations with dms-media", () => {
  /** @type {MongoMemoryReplSet | undefined} */
  let mongo;
  /** @type {string | undefined} */
  let projectFolder;
  /** @type {Awaited<ReturnType<typeof launch>> | undefined} */
  let manager;
  let originalConstants = "";
  let consumerIndex = "";
  /** @type {string[]} */
  let initialMediaKeys = [];

  before(async () => {
    originalConstants = await fs.readFile(CONSTANTS_FILE, "utf8");
    assert.ok(
      originalConstants.includes(`"${ORIGINAL_TOPIC}"`),
      "dist/constants.js is built",
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
    const config = projectConfig(mongo.getUri(), storagePath);
    await fs.writeFile(
      path.join(projectFolder, "antelope.config.ts"),
      `export default ${JSON.stringify(config, null, 2)};\n`,
    );
    manager = await launch(projectFolder, "default", { watch: true });
  });

  after(async () => {
    await fs.writeFile(CONSTANTS_FILE, originalConstants);
    if (manager) {
      await manager.stopAll();
      await manager.destroyAll();
    }
    await mongo?.stop();
    if (projectFolder) {
      await fs.rm(projectFolder, { recursive: true, force: true });
    }
  });

  void it("owns its registrations even when consumers load first", async () => {
    assert.equal(await mediaTreeStatus(), HTTP_UNAUTHORIZED);
    const topic = findFilesPageTopic();
    assert.equal(topic?.module, MEDIA_MODULE);
    assert.equal(pageTopicPair(topic.id)[1], ORIGINAL_TOPIC);
    initialMediaKeys = registrationKeys(ownedBy(MEDIA_MODULE));
    assert.ok(
      initialMediaKeys.length > 0,
      "dms-media registered its routes, pages and topics",
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
  });

  void it("keeps routes, pages and topics through a consumer reload", async () => {
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

  void it("re-registers everything from the edited files on its own reload", async () => {
    const mediaOwners = ownersOf(ownedBy(MEDIA_MODULE));
    await fs.writeFile(
      CONSTANTS_FILE,
      originalConstants.replace(`"${ORIGINAL_TOPIC}"`, `"${EDITED_TOPIC}"`),
    );
    await waitFor(
      "dms-media to register the edited topic",
      () => pageTopicPair(findFilesPageTopic()?.id)?.[1] === EDITED_TOPIC,
    );

    assert.equal(await mediaTreeStatus(), HTTP_UNAUTHORIZED);
    const mediaEntries = ownedBy(MEDIA_MODULE);
    assert.deepEqual(registrationKeys(mediaEntries), initialMediaKeys);
    const reloadedOwners = ownersOf(mediaEntries);
    assert.equal(reloadedOwners.size, 1);
    assert.ok(!mediaOwners.has([...reloadedOwners][0]), "a new generation");
  });

  void it("replays the consumer's binding to the reloaded generation", async () => {
    const token = await ownerToken();
    const tree = await request("/api/media/tree", {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.ok(tree.ok, `tree answered ${tree.status}`);
    const { folders } = treeAnswerSchema.parse(await tree.json());
    const names = folders.map((folder) => folder.name);
    assert.ok(names.includes(CONSUMER_FOLDER), names.join(", "));
  });
});
