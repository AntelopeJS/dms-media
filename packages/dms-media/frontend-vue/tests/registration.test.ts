import type { Component } from "vue";
import { expect, it, vi } from "vitest";
import frontendModule from "../dms.frontend";

/** The first import of Explorer.vue compiles the SFC and loads the DMS layers it pulls in, which outlasts vitest's 5000 ms beside busy CPUs. */
const EXPLORER_IMPORT_TIMEOUT_MS = 30_000;

it("registers every block under the DmsMedia prefix by its file name", async () => {
  const registerComponent =
    vi.fn<(name: string, component: Component) => void>();
  await frontendModule.setup({
    options: { public: {} },
    registerComponent,
    registerPage: vi.fn(),
    registerDynamicPage: vi.fn(),
    registerLayout: vi.fn(),
    registerErrorPage: vi.fn(),
    registerPlugin: vi.fn(),
    registerAccessRedirect: vi.fn(),
    registerMiddleware: vi.fn(),
    provide: vi.fn(),
    use: vi.fn(),
  });
  const names = registerComponent.mock.calls.map(([name]) => name);
  expect(frontendModule.componentPrefix).toBe("DmsMedia");
  expect(names).toEqual(
    expect.arrayContaining([
      "Explorer",
      "AssetPicker",
      "FileHeader",
      "FilePreview",
      "FileProperties",
      "ImageEditor",
      "UploadQueue",
      "PresetCards",
    ]),
  );
  for (const absent of [
    "ExplorerShell",
    "UploadQueueRow",
    "AccessTree",
    "AccessFolder",
    "AccessRulesCard",
    "AccessVisibility",
    "LinkedDetail",
  ]) {
    expect(names).not.toContain(absent);
  }
  expect(new Set(names).size).toBe(names.length);
});

it(
  "names the explorer block by the name the DMS serves it under",
  async () => {
    const { default: Explorer } =
      await import("../app/components/Explorer.vue");
    expect(Explorer.name).toBe(`${frontendModule.componentPrefix}Explorer`);
  },
  EXPLORER_IMPORT_TIMEOUT_MS,
);
