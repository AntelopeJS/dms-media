/** A kind of one-way door. */
export type DoorKind = "data" | "format" | "contract" | "outbound" | "exposure" | "publish";

/** Path rules for one door kind: globs and declared funnel modules. */
export interface DoorRule {
  globs: string[];
  funnels: string[];
  why: string;
}

/** The repo-owned layer of the verification skill, read by `dms-control`. */
export interface VerifyConfig {
  playground: string;
  prepare: string[][];
  userFacing: string[];
  notUserFacing: string[];
  smoke: string;
  smokeJourney: string;
  doors: Record<DoorKind, DoorRule | null>;
  formal: FormalCheck[];
}

/** A formal check `dms-control formal` runs when a diff touches its covered files or its own `files`. */
export interface FormalCheck {
  name: string;
  covers: string[];
  files: string[];
  command: string[];
  violation: RegExp | null;
  passing: RegExp | null;
  behaviour: { kind: "emit" };
}

import { COVERED_FILES } from "../formal-asset-files/coverage.mjs";

const SKILL = ".agents/skills/verify-dms-media";
const MODULE = "packages/dms-media";
const INTERFACE = "packages/interface-dms-media";

const config: VerifyConfig = {
  playground: `${SKILL}/playground`,
  prepare: [
    ["pnpm", "install", "--frozen-lockfile", "--prefer-offline", "--ignore-scripts"],
    ["pnpm", "run", "build"],
    ["npm", "install", "--no-save", "--no-package-lock", "--no-audit", "--no-fund", "--prefix", SKILL, "playwright-core@1.56.1"],
    ["ln", "-sfn", `../../../../${MODULE}/node_modules`, `${SKILL}/playground/node_modules`],
    [`${MODULE}/node_modules/.bin/tsc`, "-p", `${SKILL}/playground/tsconfig.build.json`],
  ],
  userFacing: [`${MODULE}/src/**`, `${MODULE}/frontend-vue/**`, `${MODULE}/skills/**`, `${MODULE}/package.json`, `${INTERFACE}/src/**`, `${INTERFACE}/package.json`],
  notUserFacing: [
    `${MODULE}/src/test/**`,
    `${MODULE}/frontend-vue/tests/**`,
    `${MODULE}/frontend-vue/.*`,
    `${MODULE}/frontend-vue/eslint.config.mjs`,
    `${MODULE}/frontend-vue/vitest.config.ts`,
    `${MODULE}/frontend-vue/pnpm-lock.yaml`,
  ],
  smoke: "smoke",
  smokeJourney: "onboard, create a folder, upload an image, see it in the Library, follow its delivery link to the same bytes",
  doors: {
    data: {
      globs: [
        `${MODULE}/src/asset-lifecycle.ts`,
        `${MODULE}/src/routes/media/folders.ts`,
        `${MODULE}/src/routes/media/bulk.ts`,
        `${MODULE}/src/routes/media/manage.ts`,
        `${MODULE}/src/routes/media/transform.ts`,
        `${MODULE}/src/routes/media/upload.ts`,
        `${MODULE}/src/crons/**`,
        `${MODULE}/src/derivatives.ts`,
      ],
      funnels: [],
      why: "these delete stored files, folders and renderings, and overwrite edited images, which a revert of the code does not bring back",
    },
    format: {
      globs: [`${MODULE}/src/db/**`, `${MODULE}/src/presets.ts`, `${MODULE}/src/routes/media/storage-keys.ts`, `${MODULE}/src/declared/records.ts`],
      funnels: [],
      why: "the media tables, the storage keys and the declaration registry are read back by the next version of the module",
    },
    contract: {
      globs: [
        `${MODULE}/package.json`,
        `${MODULE}/src/routes/**`,
        `${MODULE}/src/config.ts`,
        `${MODULE}/src/validation/**`,
        `${INTERFACE}/package.json`,
        `${INTERFACE}/src/**`,
        `${MODULE}/frontend-vue/package.json`,
      ],
      funnels: [],
      why: "other modules import the interface, the dashboard and scripts call the HTTP routes, and projects set the config keys and the renderer range",
    },
    outbound: null,
    exposure: {
      globs: [`${MODULE}/src/routes/media/delivery.ts`, `${MODULE}/src/routes/media/delivery-headers.ts`, `${MODULE}/src/routes/media/delivery-stream.ts`, `${MODULE}/src/acl/**`, `${MODULE}/src/guards.ts`, `${MODULE}/src/read-urls.ts`],
      funnels: [],
      why: "the delivery links answer without a session for public files, and the folder ACLs decide who reads and writes every file",
    },
    publish: {
      globs: [`${MODULE}/package.json`, `${INTERFACE}/package.json`, `${MODULE}/.release-it.json`, `${INTERFACE}/.release-it.json`, `${MODULE}/changelogen.config.json`, `${INTERFACE}/changelogen.config.json`, ".github/workflows/release.yml", ".github/workflows/release-interface.yml"],
      funnels: [],
      why: "the package names, their files and the release workflows claim @antelopejs/dms-media and @antelopejs/interface-dms-media in the npm registry",
    },
  },
  formal: [
    {
      name: "formal-asset-files",
      covers: COVERED_FILES,
      files: [".agents/skills/formal-asset-files/**"],
      command: ["node", ".agents/skills/formal-asset-files/check.mjs"],
      violation: /^(?:finding|BROKEN|STALE) (\S+)/gm,
      passing: /(?<=^holds +(?:\w+, )*)(\w+)(?=,| \()/gm,
      behaviour: { kind: "emit" },
    },
  ],
};

export default config;
