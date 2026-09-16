import { defineConfig } from "@antelopejs/interface-core/config";

export default defineConfig({
  name: "playground",
  modules: {
    playground: {
      source: {
        type: "local",
        path: ".",
        watchDir: ["src"],
        installCommand: ["pnpm build"],
      },
    },
    "dms-media": {
      source: {
        type: "local",
        path: "..",
        watchDir: ["src"],
        installCommand: ["pnpm build"],
      },
      config: {},
    },
    dms: {
      source: {
        type: "package",
        package: "@antelopejs/dms",
        version: ">=0.0.1 <1.0.0",
      },
      config: {
        homepage: "/welcome",
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
        version: "^1.3.0",
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
        version: "^0.1.4",
      },
      config: {
        storagePath: ".antelope/file-storage",
        baseUrl: "http://127.0.0.1:5010",
        defaultVisibility: "private",
      },
    },
    nodemailer: {
      source: {
        type: "package",
        package: "@antelopejs/nodemailer",
        version: "^0.0.4",
      },
      config: {
        ethereal: true,
      },
    },
    api: {
      source: {
        type: "package",
        package: "@antelopejs/api",
        version: "1.2.5",
      },
      config: {
        servers: [
          {
            protocol: "http",
            host: "127.0.0.1",
            port: "5010",
          },
        ],
      },
    },
  },
});
