import { defineConfig } from "@antelopejs/interface-core/config";

const dmsClientUrl = process.env.DMS_CLIENT_BASE_URL;
const dmsDevClientPort = 3001;
const dmsDevClientOrigins = ["localhost", "127.0.0.1"].map(
  (host) => `http://${host}:${dmsDevClientPort}`,
);

export default defineConfig({
  name: "playground",
  modules: {
    playground: {
      source: {
        type: "local",
        path: ".",
        watchDir: ["src"],
        installCommand: ["pnpm build"],
        // Not `pnpm build`: it starts with `rimraf dist`, and the running module is loaded from dist.
        reloadCommand: ["pnpm exec tsc"],
      },
    },
    "dms-media": {
      source: {
        type: "local",
        path: "..",
        watchDir: ["src"],
        installCommand: ["pnpm build"],
        // Not `pnpm build`: it starts with `rimraf dist`, and the running module is loaded from dist.
        reloadCommand: ["pnpm exec tsc"],
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
        homepage: "/welcome",
        auth: {
          jwtSecret: "dev",
        },
        meta: {
          title: "AntelopeJS Media",
          description: "AntelopeJS DMS media library playground",
        },
      },
    },
    mongodb: {
      source: {
        type: "package",
        package: "@antelopejs/mongodb",
        version: "^1.3.1",
      },
      config: {
        url: "mongodb://localhost:27017",
        database: "playground_dms_media",
      },
      importOverrides: [],
      disabledExports: [],
    },
    "auth-jwt": {
      source: {
        type: "package",
        package: "@antelopejs/auth-jwt",
        version: "^1.0.3",
      },
      config: {
        secret: "dev",
      },
    },
    "file-storage-local": {
      source: {
        type: "package",
        package: "@antelopejs/file-storage-local",
        version: "^0.1.5",
      },
      config: {
        storagePath: ".antelope/file-storage",
        baseUrl: "${@api.API_PUBLIC_BASE_URL}",
        defaultVisibility: "private",
      },
    },
    nodemailer: {
      source: {
        type: "package",
        package: "@antelopejs/nodemailer",
        version: "^0.0.5",
      },
      config: {
        ethereal: true,
      },
    },
    api: {
      source: {
        type: "package",
        package: "@antelopejs/api",
        version: "1.3.0",
      },
      config: {
        servers: [
          {
            protocol: "http",
            host: "127.0.0.1",
            port: "5010",
          },
        ],
        cors: {
          allowedOrigins: [
            ...dmsDevClientOrigins,
            /^https:\/\/[^/]+\.onamp\.dev$/,
            ...(dmsClientUrl ? [dmsClientUrl] : []),
          ],
        },
      },
    },
  },
});
