import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@antelopejs/interface-core/config";
import { MongoMemoryReplSet } from "mongodb-memory-server-core";

const API_PORT = 5019;
const JWT_SECRET = "test-jwt-secret";
const MONGO_BINARY_VERSION = "8.0.8";
const SMTP_HOST = "127.0.0.1";
const EPHEMERAL_PORT = 0;
const TEST_SENDER = "dms-media@test.local";
const SMTP_RESPONSES: Record<string, string> = {
  EHLO: "250-dms-media.test\r\n250 PIPELINING\r\n",
  HELO: "250 dms-media.test\r\n",
  MAIL: "250 OK\r\n",
  RCPT: "250 OK\r\n",
  DATA: "354 End data with <CR><LF>.<CR><LF>\r\n",
  RSET: "250 OK\r\n",
  NOOP: "250 OK\r\n",
  QUIT: "221 Bye\r\n",
};

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
  const response = SMTP_RESPONSES[command] ?? "250 OK\r\n";
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
  if (!address || typeof address === "string")
    throw new Error("Invalid SMTP address");
  return address.port;
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
        installCommand: ["pnpm build"],
      },
      config: {},
    },
    dms: {
      source: {
        type: "package",
        package: "@antelopejs/dms",
        version: ">=0.4.0 <1.0.0",
      },
      config: {
        auth: {
          jwtSecret: JWT_SECRET,
        },
      },
    },
    mongodb: {
      source: {
        type: "package",
        package: "@antelopejs/mongodb",
        version: "1.3.1",
      },
    },
    "auth-jwt": {
      source: {
        type: "package",
        package: "@antelopejs/auth-jwt",
        version: "1.0.3",
      },
      config: {
        secret: JWT_SECRET,
      },
    },
    api: {
      source: {
        type: "package",
        package: "@antelopejs/api",
        version: "1.3.0",
      },
      config: {
        servers: [{ protocol: "http", host: "127.0.0.1", port: API_PORT }],
        publicBaseUrl: `http://127.0.0.1:${API_PORT}`,
      },
    },
    "file-storage-local": {
      source: {
        type: "package",
        package: "@antelopejs/file-storage-local",
        version: "0.1.5",
      },
    },
    nodemailer: {
      source: {
        type: "package",
        package: "@antelopejs/nodemailer",
        version: "0.0.5",
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
      mongod = await MongoMemoryReplSet.create({
        replSet: { count: 1 },
        binary: { version: MONGO_BINARY_VERSION },
      });
      storageDir = await mkdtemp(join(tmpdir(), "dms-media-test-storage-"));

      const mongoUrl = mongod.getUri();
      process.env.TEST_MONGO_URL = mongoUrl;
      process.env.TEST_API_BASE_URL = `http://127.0.0.1:${API_PORT}`;
      process.env.TEST_JWT_SECRET = JWT_SECRET;

      return {
        modules: {
          mongodb: {
            config: { url: mongoUrl, database: "dms-media-test" },
          },
          "file-storage-local": {
            config: {
              storagePath: storageDir,
              baseUrl: `http://127.0.0.1:${API_PORT}`,
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
