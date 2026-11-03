import { defineConfig } from "@antelopejs/interface-core/config";

const preferredApiPort = process.env.PORT ?? "5010";
const dmsClientUrl = process.env.DMS_CLIENT_BASE_URL;

/**
 * Where the browser sends upload bytes: the dashboard's origin, which proxies
 * the storage (the default), the API's own origin (`api`), or a port nothing
 * listens on (`unreachable`).
 */
function storageBaseUrl(): string {
  const mode = process.env.VERIFY_MEDIA_STORAGE_ORIGIN;
  if (mode === "api") return `http://127.0.0.1:${preferredApiPort}`;
  if (mode === "unreachable") return "http://127.0.0.1:9";
  return "${@api.API_PUBLIC_BASE_URL}";
}

type PresetFit = "cover" | "contain" | "inside";
type PresetFormat = "webp" | "jpeg" | "png" | "avif";
type AclRight = "read" | "write" | "manage";

interface PresetConfig {
  id: string;
  width?: number;
  height?: number;
  fit?: PresetFit;
  format?: PresetFormat;
  quality?: number;
}

interface AclEntryConfig {
  subject: { kind: "permission" | "role"; id: string };
  rights: AclRight[];
}

interface MediaConfig {
  storage?: string;
  rootAcl?: AclEntryConfig[];
  allowedMimetypes?: string[];
  storageQuotaBytes?: number;
  publicBaseUrl?: string;
  presets?: PresetConfig[];
}

const FITS: readonly PresetFit[] = ["cover", "contain", "inside"];
const FORMATS: readonly PresetFormat[] = ["webp", "jpeg", "png", "avif"];
const RIGHTS: readonly AclRight[] = ["read", "write", "manage"];

function numberOrUndefined(text: string | undefined): number | undefined {
  return text === undefined || text === "" ? undefined : Number(text);
}

function pickFrom<T extends string>(
  values: readonly T[],
  text: string | undefined,
): T | undefined {
  return values.find((value) => value === text);
}

/** `id:width:height:fit:format:quality`, presets separated by `;`, empty fields left out. */
function parsePresets(text: string): PresetConfig[] {
  return text.split(";").map((spec) => {
    const [id = "", width, height, fit, format, quality] = spec.split(":");
    return {
      id,
      width: numberOrUndefined(width),
      height: numberOrUndefined(height),
      fit: pickFrom(FITS, fit),
      format: pickFrom(FORMATS, format),
      quality: numberOrUndefined(quality),
    };
  });
}

/** `permission:<id>:read|write` or `role:<id>:manage`, entries separated by `;`. */
function parseAcl(text: string): AclEntryConfig[] {
  return text.split(";").map((spec) => {
    const [kind, id = "", rights = ""] = spec.split(":");
    return {
      subject: { kind: kind === "role" ? "role" : "permission", id },
      rights: rights
        .split("|")
        .flatMap((right) => pickFrom(RIGHTS, right) ?? []),
    };
  });
}

/**
 * The module's options, each from a `VERIFY_MEDIA_*` variable a journey sets
 * in the run's environment before it restarts the backend. Unset, the module
 * runs its own defaults.
 */
function mediaConfig(): MediaConfig {
  const env = process.env;
  const config: MediaConfig = {};
  if (env.VERIFY_MEDIA_STORAGE) config.storage = env.VERIFY_MEDIA_STORAGE;
  if (env.VERIFY_MEDIA_ROOT_ACL)
    config.rootAcl = parseAcl(env.VERIFY_MEDIA_ROOT_ACL);
  if (env.VERIFY_MEDIA_MIMETYPES)
    config.allowedMimetypes = env.VERIFY_MEDIA_MIMETYPES.split(",");
  if (env.VERIFY_MEDIA_QUOTA)
    config.storageQuotaBytes = Number(env.VERIFY_MEDIA_QUOTA);
  if (env.VERIFY_MEDIA_PUBLIC_BASE_URL)
    config.publicBaseUrl = env.VERIFY_MEDIA_PUBLIC_BASE_URL;
  if (env.VERIFY_MEDIA_PRESETS)
    config.presets = parsePresets(env.VERIFY_MEDIA_PRESETS);
  return config;
}

/**
 * The repository's playground with the ports, origins, secrets and mail
 * `dms-control` sets for a run, a fixture module (`app`) and the module under
 * verification built from the checkout.
 */
export default defineConfig({
  name: "verify-dms-media",
  modules: {
    app: {
      source: { type: "local", path: "." },
    },
    "dms-media": {
      source: { type: "local", path: "../../../../packages/dms-media" },
      config: mediaConfig(),
    },
    dms: {
      source: {
        type: "package",
        package: "@antelopejs/dms",
        version: ">=0.11.0 <1.0.0",
      },
      config: {
        homepage: "/modules",
        meta: { title: "AntelopeJS Media", description: "Media verification" },
        auth: {
          jwtSecret: process.env.DMS_JWT_SECRET ?? "dev",
          signInCountry: { database: false },
        },
        htmlRender: {
          serviceSecret: process.env.DMS_HTML_RENDER_SECRET ?? "dev",
          renderEndpoint: dmsClientUrl && `${dmsClientUrl}/api/html/render`,
        },
        apiBaseUrl: "${@api.API_PUBLIC_BASE_URL}",
        clientBaseUrl: dmsClientUrl,
        frontend: { bootstrapSecret: process.env.DMS_BOOTSTRAP_SECRET },
        docsPreview: true,
      },
    },
    mongodb: {
      source: {
        type: "package",
        package: "@antelopejs/mongodb",
        version: "^1.5.0",
      },
      config: {
        url: process.env.MONGO_URL ?? "mongodb://localhost:27017",
        database: process.env.MONGO_DATABASE ?? "verify_dms_media",
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
      config: { secret: process.env.AUTH_JWT_SECRET ?? "dev" },
    },
    "file-storage-local": {
      source: {
        type: "package",
        package: "@antelopejs/file-storage-local",
        version: ">=0.1.13 <1.0.0",
      },
      config: {
        storagePath: ".antelope/file-storage",
        baseUrl: storageBaseUrl(),
        defaultVisibility: "private",
      },
    },
    nodemailer: {
      source: {
        type: "package",
        package: "@antelopejs/nodemailer",
        version: ">=0.0.6 <1.0.0",
      },
      config: {
        host: "127.0.0.1",
        port: Number(process.env.DMS_SMTP_PORT ?? "9"),
      },
    },
    api: {
      source: {
        type: "package",
        package: "@antelopejs/api",
        version: "^1.5.0",
      },
      config: {
        servers: [{ protocol: "http", port: preferredApiPort }],
        publicBaseUrl: process.env.DMS_CLIENT_BASE_URL,
        cors: {
          allowedOrigins:
            process.env.VERIFY_MEDIA_NO_CORS === "1"
              ? ["https://elsewhere.example.org"]
              : [process.env.DMS_CLIENT_BASE_URL ?? "http://localhost:3001"],
        },
      },
    },
  },
});
