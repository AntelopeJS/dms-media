import { resolve } from "node:path";
import { testTimeouts } from "@antelopejs/tooling-configs/vitest";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

/**
 * The renderer and the DMS core layer the server-render tests run on: the
 * ones the module installs (`@antelopejs/dms-frontend`, `@antelopejs/dms`),
 * as `pnpm test:frontend` checks the module against them.
 */
const root = resolve(__dirname, "..", "node_modules", "@antelopejs");

/**
 * The tests compile without `tsconfig.json`, which extends the types only
 * `pnpm lint` writes to `.dms-types`.
 */
const TESTS_TSCONFIG = "{}";

/** What the renderer reads of Inertia, vue-i18n and unhead in the browser only. */
const BROWSER_ONLY_FIXTURES = {
  "@inertiajs/vue3": resolve(__dirname, "tests/fixtures/inertia.ts"),
  "vue-i18n": resolve(__dirname, "tests/fixtures/vueI18n.ts"),
  "@unhead/vue": resolve(__dirname, "tests/fixtures/unhead.ts"),
};

/** One Vue for the renderer and the components. */
const SHARED_VUE = resolve(__dirname, "node_modules/vue");

export default defineConfig({
  plugins: [vue()],
  esbuild: { tsconfigRaw: TESTS_TSCONFIG },
  resolve: {
    alias: {
      "#dms/frontend-module": resolve(
        root,
        "dms-frontend/templates/vue/frontend-module.ts",
      ),
      "#dms-core": resolve(root, "dms/frontend-vue/layers/dms-core"),
      "#dms-ui": resolve(root, "dms/frontend-vue/layers/dms-ui"),
      vue: SHARED_VUE,
      ...BROWSER_ONLY_FIXTURES,
    },
  },
  test: {
    ...testTimeouts,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
