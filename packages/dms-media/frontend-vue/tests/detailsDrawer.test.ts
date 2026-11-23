import { strict as assert } from "node:assert";
import { computed, effectScope, nextTick, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "./fixtures/serverRender";
import { useExplorerDetailsDrawer } from "../app/composables/library/useExplorerDetailsDrawer";
import type { ExplorerLayout } from "../app/composables/library/useExplorerLayout";
import type { DrawerRowHeader } from "#dms-ui/app/composables/containers/types";

interface OpenedDrawer {
  options: {
    direction: string;
    componentOptions?: unknown;
    rowHeader: DrawerRowHeader;
  };
  close: ReturnType<typeof vi.fn>;
  patch: ReturnType<
    typeof vi.fn<(options: { rowHeader: DrawerRowHeader }) => void>
  >;
  settle: () => Promise<void>;
}

interface TestFile {
  id: string;
  name: string;
}

let opened: OpenedDrawer[] = [];

function firstDrawer(): OpenedDrawer {
  const [drawer] = opened;
  assert.ok(drawer);
  return drawer;
}

function openDrawer(options: OpenedDrawer["options"]) {
  let resolve!: () => void;
  const result = new Promise<void>((done) => (resolve = done));
  const drawer: OpenedDrawer = {
    options,
    close: vi.fn(() => resolve()),
    patch: vi.fn<(options: { rowHeader: DrawerRowHeader }) => void>(),
    settle: async () => {
      resolve();
      await result;
      await nextTick();
    },
  };
  opened.push(drawer);
  return { result, close: drawer.close, patch: drawer.patch };
}

const FILES: TestFile[] = [
  { id: "a", name: "a.png" },
  { id: "b", name: "b.pdf" },
  { id: "c", name: "c.jpg" },
];

function setup(isWide = false) {
  const isInline = ref(isWide);
  const layout: ExplorerLayout = {
    width: computed(() => (isInline.value ? "wide" : "narrow")),
    hasInlineSidebar: computed(() => true),
    hasInlineDetails: computed(() => isInline.value),
    opensOnTap: computed(() => false),
    isSidebarDrawerOpen: ref(false),
    isDetailsDrawerOpen: ref(false),
    scopeFolderId: undefined,
    accept: [],
    history: computed(() => undefined),
  };
  const assets = ref(FILES);
  const selectedIds = ref<string[]>([]);
  const select = vi.fn((id: string) => (selectedIds.value = [id]));
  const focusedAsset = computed(() =>
    selectedIds.value.length === 1
      ? assets.value.find((file) => file.id === selectedIds.value[0])
      : undefined,
  );
  const library = { listing: { assets }, selection: { focusedAsset, select } };
  const scope = effectScope();
  scope.run(() => useExplorerDetailsDrawer(layout, library));
  return { layout, isInline, scope, selectedIds, select };
}

async function toggle(layout: ExplorerLayout, isOpen: boolean): Promise<void> {
  layout.isDetailsDrawerOpen.value = isOpen;
  await nextTick();
}

beforeEach(() => {
  opened = [];
  vi.stubGlobal("useDrawer", () => ({ open: openDrawer }));
});

describe("details drawer", () => {
  it("opens on the right, and closes with the state", async () => {
    const { layout } = setup();
    await toggle(layout, true);
    expect(opened).toHaveLength(1);
    expect(firstDrawer().options.direction).toBe("right");
    expect(firstDrawer().options.componentOptions).toBeUndefined();
    await toggle(layout, false);
    expect(firstDrawer().close).toHaveBeenCalledOnce();
  });

  it("turns the state off when the drawer is dismissed", async () => {
    const { layout } = setup();
    await toggle(layout, true);
    await firstDrawer().settle();
    expect(layout.isDetailsDrawerOpen.value).toBe(false);
    await toggle(layout, true);
    expect(opened).toHaveLength(2);
  });

  it("puts the drawer away while the details sit inline, and brings it back", async () => {
    const { layout, isInline } = setup();
    await toggle(layout, true);
    isInline.value = true;
    await nextTick();
    expect(firstDrawer().close).toHaveBeenCalledOnce();
    await nextTick();
    expect(layout.isDetailsDrawerOpen.value).toBe(true);
    isInline.value = false;
    await nextTick();
    expect(opened).toHaveLength(2);
  });

  it("never opens while the details sit inline", async () => {
    const { layout } = setup(true);
    await toggle(layout, true);
    expect(opened).toHaveLength(0);
  });

  it("closes with the explorer", async () => {
    const { layout, scope } = setup();
    await toggle(layout, true);
    scope.stop();
    expect(firstDrawer().close).toHaveBeenCalledOnce();
  });

  it("heads a single file with its name and place among the files shown", async () => {
    const { layout, selectedIds } = setup();
    selectedIds.value = ["b"];
    await toggle(layout, true);
    const header = firstDrawer().options.rowHeader;
    expect(header.title).toBe("b.pdf");
    expect(header.navigation).toMatchObject({
      index: 1,
      total: 3,
      hasPrev: true,
      hasNext: true,
    });
  });

  it("keeps its own title without a single file", async () => {
    const { layout, selectedIds } = setup();
    selectedIds.value = ["a", "b"];
    await toggle(layout, true);
    expect(firstDrawer().options.rowHeader).toEqual({});
  });

  it("steps through the files by selecting them, and follows the selection", async () => {
    const { layout, selectedIds, select } = setup();
    selectedIds.value = ["a"];
    await toggle(layout, true);
    expect(firstDrawer().options.rowHeader.navigation?.hasPrev).toBe(false);
    firstDrawer().options.rowHeader.navigation?.next();
    expect(select).toHaveBeenCalledWith("b", { extend: false, toggle: false });
    await nextTick();
    const patched = firstDrawer().patch.mock.lastCall?.[0];
    expect(patched?.rowHeader.title).toBe("b.pdf");
    expect(patched?.rowHeader.navigation?.index).toBe(1);
  });
});
