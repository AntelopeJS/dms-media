import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { version as DMS_VERSION } from "@antelopejs/dms/package.json";
import { defineConfig } from "@antelopejs/interface-core/config";
import { MongoMemoryReplSet } from "mongodb-memory-server-core";
import { isString } from "../guards";
import { SETUP_TOKEN } from "./helpers/setup-token";
import STACK_MODULES from "./stack-modules.json";

const LOCAL_BUILD_COMMAND = process.env.DMS_PREBUILT ? [] : ["pnpm build"];
const JWT_SECRET = "test-jwt-secret";
const HTML_RENDER_SECRET = "test-html-render-secret";
const MONGO_BINARY_VERSION = "8.0.8";
const SMTP_HOST = "127.0.0.1";
const EPHEMERAL_PORT = 0;
const TEST_SENDER = "dms-media@test.local";
const SMTP_RESPONSES = new Map([
  ["EHLO", "250-dms-media.test\r\n250 PIPELINING\r\n"],
  ["HELO", "250 dms-media.test\r\n"],
  ["MAIL", "250 OK\r\n"],
  ["RCPT", "250 OK\r\n"],
  ["DATA", "354 End data with <CR><LF>.<CR><LF>\r\n"],
  ["RSET", "250 OK\r\n"],
  ["NOOP", "250 OK\r\n"],
  ["QUIT", "221 Bye\r\n"],
]);

interface SmtpConnectionState {
  pending: string;
  isReadingData: boolean;
}

let mongod: MongoMemoryReplSet;
let storageDir: string;
let smtpServer: Server;

function processSmtpLine(
  socket: Socket,
  state: SmtpConnectionState,
  line: string,
): void {
  if (state.isReadingData) {
    if (line === ".") {
      state.isReadingData = false;
      socket.write("250 Queued\r\n");
    }
    return;
  }
  const command = line.split(" ", 1)[0]?.toUpperCase() ?? "";
  state.isReadingData = command === "DATA";
  const response = SMTP_RESPONSES.get(command) ?? "250 OK\r\n";
  if (command === "QUIT") socket.end(response);
  else socket.write(response);
}

function createSmtpFixture(): Server {
  return createServer((socket) => {
    const state: SmtpConnectionState = { pending: "", isReadingData: false };
    socket.setEncoding("utf8");
    socket.write("220 dms-media.test ESMTP\r\n");
    socket.on("data", (chunk) => {
      state.pending += chunk;
      const lines = state.pending.split(/\r?\n/);
      state.pending = lines.pop() ?? "";
      for (const line of lines) processSmtpLine(socket, state, line);
    });
  });
}

async function startSmtpFixture(): Promise<number> {
  smtpServer = createSmtpFixture();
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    smtpServer.once("error", onError);
    smtpServer.listen(EPHEMERAL_PORT, SMTP_HOST, () => {
      smtpServer.off("error", onError);
      resolve();
    });
  });
  const address = smtpServer.address();
  if (!address || isString(address)) throw new Error("Invalid SMTP address");
  return address.port;
}

/** Asks the OS for a free port so concurrent suite runs never collide. */
async function findFreePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(EPHEMERAL_PORT, SMTP_HOST, resolve);
  });
  const address = probe.address();
  const port = !address || isString(address) ? undefined : address.port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  if (port === undefined) throw new Error("Invalid probe address");
  return port;
}

function stopSmtpFixture(): Promise<void> {
  if (!smtpServer) return Promise.resolve();
  return new Promise((resolve, reject) => {
    smtpServer.close((error) => (error ? reject(error) : resolve()));
  });
}

export default defineConfig({
  name: "dms-media-test",
  cacheFolder: ".antelope/cache",
  logging: {
    channelFilter: {
      "*": "warn",
    },
  },
  modules: {
    local: {
      source: {
        type: "local",
        path: ".",
        installCommand: LOCAL_BUILD_COMMAND,
      },
      config: {},
    },
    dms: {
      source: {
        type: "package",
        package: "@antelopejs/dms",
        version: DMS_VERSION,
      },
      config: {
        auth: {
          jwtSecret: JWT_SECRET,
        },
        /**
         * Outside development, which the test run is not, dms 0.10 refuses
         * to start without a render secret of its own.
         */
        htmlRender: {
          serviceSecret: HTML_RENDER_SECRET,
        },
      },
    },
    mongodb: {
      source: {
        type: "package",
        package: "@antelopejs/mongodb",
        version: STACK_MODULES["@antelopejs/mongodb"],
      },
    },
    "auth-jwt": {
      source: {
        type: "package",
        package: "@antelopejs/auth-jwt",
        version: STACK_MODULES["@antelopejs/auth-jwt"],
      },
      config: {
        secret: JWT_SECRET,
      },
    },
    api: {
      source: {
        type: "package",
        package: "@antelopejs/api",
        version: STACK_MODULES["@antelopejs/api"],
      },
      config: {},
    },
    "file-storage-local": {
      source: {
        type: "package",
        package: "@antelopejs/file-storage-local",
        version: STACK_MODULES["@antelopejs/file-storage-local"],
      },
    },
    nodemailer: {
      source: {
        type: "package",
        package: "@antelopejs/nodemailer",
        version: STACK_MODULES["@antelopejs/nodemailer"],
      },
      config: {
        host: SMTP_HOST,
        port: EPHEMERAL_PORT,
        secure: false,
        defaults: { from: TEST_SENDER },
      },
    },
  },
  test: {
    folder: process.env.DMS_MEDIA_TEST_DIR ?? "dist/test",
    async setup() {
      const smtpPort = await startSmtpFixture();
      const apiPort = await findFreePort();
      const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
      mongod = await MongoMemoryReplSet.create({
        replSet: { count: 1 },
        binary: { version: MONGO_BINARY_VERSION },
      });
      storageDir = await mkdtemp(join(tmpdir(), "dms-media-test-storage-"));

      const mongoUrl = mongod.getUri();
      process.env.TEST_MONGO_URL = mongoUrl;
      process.env.TEST_STORAGE_DIR = storageDir;
      process.env.TEST_API_BASE_URL = apiBaseUrl;
      process.env.TEST_JWT_SECRET = JWT_SECRET;
      process.env.DMS_SETUP_TOKEN = SETUP_TOKEN;

      return {
        modules: {
          dms: {
            config: {
              /**
               * No frontend server runs here: the dashboard URL is the API,
               * whose paths the front proxy serves unchanged.
               */
              clientBaseUrl: apiBaseUrl,
            },
          },
          api: {
            config: {
              servers: [{ protocol: "http", host: SMTP_HOST, port: apiPort }],
              publicBaseUrl: apiBaseUrl,
            },
          },
          mongodb: {
            config: { url: mongoUrl, database: "dms-media-test" },
          },
          "file-storage-local": {
            config: {
              storagePath: storageDir,
              baseUrl: apiBaseUrl,
              defaultVisibility: "private",
            },
          },
          nodemailer: {
            config: { port: smtpPort },
          },
        },
      };
    },
    async cleanup() {
      try {
        await Promise.all([
          mongod ? mongod.stop() : Promise.resolve(),
          stopSmtpFixture(),
        ]);
      } finally {
        if (storageDir) await rm(storageDir, { recursive: true, force: true });
      }
    },
  },
});
