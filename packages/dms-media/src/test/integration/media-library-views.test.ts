import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { z } from "zod";
import { MediaAssetModel } from "../../db";
import { uploadAsset } from "../helpers/assets";
import { createdBody, readBody } from "../helpers/bodies";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";
import { solidPng } from "../helpers/png";

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const DAY_MS = 24 * 60 * 60 * 1000;
const TEXT_MIMETYPE = "text/plain";

const assetsBody = z.object({
  assets: z.array(
    z.object({ id: z.string(), name: z.string(), size: z.number() }),
  ),
});
const foldersBody = z.object({
  folders: z.array(z.object({ id: z.string() })),
});

let library: AxiosInstance;

async function libraryFolder(name: string, parentId?: string): Promise<string> {
  const created = await library.post("/api/media/folders", { name, parentId });
  expect(created.status, name).to.equal(HTTP_OK);
  return readBody(created, createdBody).id;
}

/** The names a listing, search or view answers, in the order it answers them. */
async function namesOf(
  path: string,
  params: Record<string, string | number> = {},
): Promise<string[]> {
  const response = await library.get(path, { params });
  expect(response.status, path).to.equal(HTTP_OK);
  return readBody(response, assetsBody).assets.map((asset) => asset.name);
}

const treeViewsBody = z.object({
  folders: z.array(z.object({ id: z.string(), starred: z.boolean() })),
  views: z.object({ starred: z.number(), missingAlt: z.number() }),
});

async function treeViews() {
  return readBody(await library.get("/api/media/tree"), treeViewsBody);
}

function describeSmartViews(): void {
  describe("smart views gather files across folders", () => {
    it("lists each view's files, counts them in the tree, and treats a blank alt text as missing", async () => {
      const parent = await libraryFolder("Smart views");
      try {
        const before = await treeViews();
        const one = await libraryFolder("One", parent);
        const two = await libraryFolder("Two", parent);
        const inner = await libraryFolder("Inner", one);
        const upload = async (folder: string, name: string, size: number) =>
          uploadAsset(
            library,
            folder,
            name,
            "image/png",
            await solidPng(size, size),
          );
        await upload(inner, "nested.png", 6);
        const small = await upload(one, "small.png", 4);
        const big = await upload(two, "big.png", 300);
        const doc = await uploadAsset(
          library,
          two,
          "doc.txt",
          TEXT_MIMETYPE,
          Buffer.from("x"),
        );
        const blank = await upload(one, "blank.png", 5);
        await library.post(`/api/media/assets/${small.id}/update`, {
          alt: "Petit",
        });
        await library.post(`/api/media/assets/${blank.id}/update`, {
          alt: "   ",
        });
        await library.post("/api/media/favorites", {
          kind: "asset",
          targetId: doc.id,
          starred: true,
        });
        await library.post("/api/media/favorites", {
          kind: "folder",
          targetId: two,
          starred: true,
        });
        await library.post(`/api/media/assets/${big.id}/visibility`, {
          visibility: "public",
        });
        const view = (name: string, scope = parent) =>
          namesOf(`/api/media/views/${name}`, { folderId: scope });
        expect(await view("recent")).to.deep.equal([
          "blank.png",
          "doc.txt",
          "big.png",
          "small.png",
          "nested.png",
        ]);
        expect((await view("largest"))[0]).to.equal("big.png");
        expect(await view("public")).to.deep.equal(["big.png"]);
        expect(await view("missing-alt")).to.have.members([
          "big.png",
          "blank.png",
          "nested.png",
        ]);
        expect(await view("largest", one)).to.have.members([
          "blank.png",
          "nested.png",
          "small.png",
        ]);
        expect(await view("missing-alt", one)).to.have.members([
          "blank.png",
          "nested.png",
        ]);
        const stored = await library.get(`/api/media/assets/${blank.id}`);
        expect(stored.data.asset.alt).to.equal("   ");
        const starred = await library.get("/api/media/views/starred");
        expect(
          readBody(starred, assetsBody).assets.map((asset) => asset.id),
        ).to.include(doc.id);
        expect(
          readBody(starred, foldersBody).folders.map((folder) => folder.id),
        ).to.include(two);
        const after = await treeViews();
        expect(after.views.starred - before.views.starred).to.equal(2);
        expect(after.views.missingAlt - before.views.missingAlt).to.equal(3);
        expect(
          after.folders.find((folder) => folder.id === two)?.starred,
        ).to.equal(true);
      } finally {
        await library.delete(`/api/media/folders/${parent}`);
      }
    });
  });
}

const VIEW_FILES = [
  { name: "d-medium.txt", size: 1500 },
  { name: "a-small.txt", size: 100 },
  { name: "b-large.txt", size: 3000 },
  { name: "c-tiny.txt", size: 10 },
];

function describeViewSorts(): void {
  describe("a sort replaces the order of a Largest or Recent view", () => {
    it("lists the biggest file first and the newest first until a sort and its direction ask for another order", async () => {
      const folder = await libraryFolder("View order");
      try {
        for (const file of VIEW_FILES)
          await uploadAsset(
            library,
            folder,
            file.name,
            TEXT_MIMETYPE,
            Buffer.alloc(file.size, 97),
          );
        const order = (view: string, params: Record<string, string> = {}) =>
          namesOf(`/api/media/views/${view}`, { folderId: folder, ...params });
        expect(await order("largest")).to.deep.equal([
          "b-large.txt",
          "d-medium.txt",
          "a-small.txt",
          "c-tiny.txt",
        ]);
        expect(await order("recent")).to.deep.equal([
          "c-tiny.txt",
          "b-large.txt",
          "a-small.txt",
          "d-medium.txt",
        ]);
        expect(await order("largest", { sort: "name" })).to.deep.equal([
          "a-small.txt",
          "b-large.txt",
          "c-tiny.txt",
          "d-medium.txt",
        ]);
        expect(
          await order("largest", { sort: "name", direction: "desc" }),
        ).to.deep.equal([
          "d-medium.txt",
          "c-tiny.txt",
          "b-large.txt",
          "a-small.txt",
        ]);
        expect(
          await order("largest", { sort: "size", direction: "asc" }),
        ).to.deep.equal([
          "c-tiny.txt",
          "a-small.txt",
          "d-medium.txt",
          "b-large.txt",
        ]);
        expect(
          await order("largest", { sort: "date", direction: "asc" }),
        ).to.deep.equal([
          "d-medium.txt",
          "a-small.txt",
          "b-large.txt",
          "c-tiny.txt",
        ]);
        expect(await order("recent", { sort: "name" })).to.deep.equal([
          "a-small.txt",
          "b-large.txt",
          "c-tiny.txt",
          "d-medium.txt",
        ]);
        expect(
          await order("recent", { sort: "size", direction: "desc" }),
        ).to.deep.equal([
          "b-large.txt",
          "d-medium.txt",
          "a-small.txt",
          "c-tiny.txt",
        ]);
      } finally {
        await library.delete(`/api/media/folders/${folder}`);
      }
    });
  });
}

interface FacetFixture {
  folder: () => string;
  sizes: () => [string, number][];
  listing: (params: Record<string, string | number>) => Promise<string[]>;
}

/** Registers hooks that give a describe block a folder of three images and a PDF, one image public. */
function useFacetFolder(): FacetFixture {
  let folder = "";
  let sizes: [string, number][] = [];
  before(async () => {
    folder = await libraryFolder("Facets journey");
    const files: [string, string, Buffer][] = [
      ["c-wide.png", "image/png", await solidPng(60, 20)],
      ["a-tall.png", "image/png", await solidPng(20, 60)],
      ["b-square.png", "image/png", await solidPng(30, 30)],
      ["d-doc.pdf", "application/pdf", Buffer.alloc(9000, 37)],
    ];
    sizes = files.map(([name, , bytes]) => [name, bytes.byteLength]);
    for (const [name, mimetype, bytes] of files) {
      const uploaded = await uploadAsset(
        library,
        folder,
        name,
        mimetype,
        bytes,
      );
      if (name === "c-wide.png")
        await library.post(`/api/media/assets/${uploaded.id}/visibility`, {
          visibility: "public",
        });
    }
  });
  after(async () => {
    await library.delete(`/api/media/folders/${folder}`);
  });
  return {
    folder: () => folder,
    sizes: () => sizes,
    listing: (params) => namesOf(`/api/media/folders/${folder}/assets`, params),
  };
}

function describeFacets(): void {
  describe("facets and sort narrow and order a listing", () => {
    const fixture = useFacetFolder();
    const listing = fixture.listing;

    it("narrows a listing by type, visibility, modified window and orientation", async () => {
      expect(await listing({ type: "image" })).to.deep.equal([
        "a-tall.png",
        "b-square.png",
        "c-wide.png",
      ]);
      expect(await listing({ type: "pdf" })).to.deep.equal(["d-doc.pdf"]);
      expect(await listing({ visibility: "public" })).to.deep.equal([
        "c-wide.png",
      ]);
      expect(await listing({ visibility: "private" })).to.have.members([
        "a-tall.png",
        "b-square.png",
        "d-doc.pdf",
      ]);
      expect(await listing({ modified: "7d" })).to.have.length(4);
      expect(await listing({ orientation: "landscape" })).to.deep.equal([
        "c-wide.png",
      ]);
      expect(await listing({ orientation: "portrait" })).to.deep.equal([
        "a-tall.png",
      ]);
      expect(await listing({ orientation: "square" })).to.deep.equal([
        "b-square.png",
      ]);
    });

    it("orders a listing by name, date, size and type in either direction", async () => {
      expect(await listing({ sort: "name", direction: "desc" })).to.deep.equal([
        "d-doc.pdf",
        "c-wide.png",
        "b-square.png",
        "a-tall.png",
      ]);
      expect(await listing({ sort: "date", direction: "asc" })).to.deep.equal([
        "c-wide.png",
        "a-tall.png",
        "b-square.png",
        "d-doc.pdf",
      ]);
      expect(await listing({ sort: "date", direction: "desc" })).to.deep.equal([
        "d-doc.pdf",
        "b-square.png",
        "a-tall.png",
        "c-wide.png",
      ]);
      const ascending = [...fixture.sizes()]
        .sort((left, right) => left[1] - right[1])
        .map(([name]) => name);
      expect(await listing({ sort: "size", direction: "asc" })).to.deep.equal(
        ascending,
      );
      expect(await listing({ sort: "size", direction: "desc" })).to.deep.equal(
        [...ascending].reverse(),
      );
      expect(await listing({ sort: "type", direction: "asc" })).to.deep.equal([
        "d-doc.pdf",
        "a-tall.png",
        "b-square.png",
        "c-wide.png",
      ]);
      expect(await listing({ sort: "type", direction: "desc" })).to.deep.equal([
        "c-wide.png",
        "b-square.png",
        "a-tall.png",
        "d-doc.pdf",
      ]);
    });
  });
}

function describePaging(): void {
  describe("paging and the facets of search and views", () => {
    const fixture = useFacetFolder();
    const listing = fixture.listing;

    it("pages with an offset and a limit of at most 500, and gives search and views the same facets", async () => {
      expect(await listing({ offset: 1, limit: 2 })).to.deep.equal([
        "b-square.png",
        "c-wide.png",
      ]);
      const tooMany = await library.get(
        `/api/media/folders/${fixture.folder()}/assets`,
        {
          params: { limit: 501 },
        },
      );
      expect(tooMany.status).to.equal(HTTP_BAD_REQUEST);
      const search = (q: string) =>
        namesOf("/api/media/search", {
          q,
          type: "image",
          folderId: fixture.folder(),
        });
      expect(await search("png")).to.have.members([
        "a-tall.png",
        "b-square.png",
        "c-wide.png",
      ]);
      expect(await search("doc")).to.deep.equal([]);
      expect(
        await namesOf("/api/media/views/recent", {
          folderId: fixture.folder(),
          orientation: "portrait",
        }),
      ).to.deep.equal(["a-tall.png"]);
    });

    it("orders file names in natural order", async () => {
      const numbered = await libraryFolder("Numbered names");
      try {
        for (const name of ["img10.png", "img2.png", "img1.png"])
          await uploadAsset(
            library,
            numbered,
            name,
            "image/png",
            await solidPng(3, 3),
          );
        expect(
          await namesOf(`/api/media/folders/${numbered}/assets`, {
            sort: "name",
          }),
        ).to.deep.equal(["img1.png", "img2.png", "img10.png"]);
      } finally {
        await library.delete(`/api/media/folders/${numbered}`);
      }
    });
  });
}

const MODIFIED_FILES = [
  { name: "d3.png", days: 3 },
  { name: "d10.png", days: 10 },
  { name: "d40.png", days: 40 },
  { name: "d400.png", days: 400 },
];

function byName(names: string[]): string[] {
  return [...names].sort((left, right) => left.localeCompare(right));
}

function describeModifiedWindows(): void {
  describe("the modified filter keeps its window", () => {
    it("keeps the files changed in the last 7 days, the last 30 days or since 1 January, and every file for any date", async () => {
      const folder = await libraryFolder("Modified windows");
      try {
        const model = GetModel(MediaAssetModel, DEFAULT_TENANT_ID);
        const now = Date.now();
        for (const file of MODIFIED_FILES) {
          const uploaded = await uploadAsset(
            library,
            folder,
            file.name,
            "image/png",
            await solidPng(6, 6),
          );
          await model.table
            .get(uploaded.id)
            .update({ updatedAt: new Date(now - file.days * DAY_MS) })
            .run();
        }
        const january = new Date(new Date(now).getFullYear(), 0, 1).getTime();
        const inYear = MODIFIED_FILES.filter(
          (file) => now - file.days * DAY_MS >= january,
        ).map((file) => file.name);
        const window = async (modified: string) =>
          byName(
            await namesOf(`/api/media/folders/${folder}/assets`, {
              modified,
              limit: 50,
            }),
          );
        expect(await window("7d")).to.deep.equal(["d3.png"]);
        expect(await window("30d")).to.deep.equal(["d10.png", "d3.png"]);
        expect(await window("year")).to.deep.equal(byName(inYear));
        expect(await window("any")).to.deep.equal(
          byName(MODIFIED_FILES.map((file) => file.name)),
        );
      } finally {
        await library.delete(`/api/media/folders/${folder}`);
      }
    });
  });
}

describe("[integration] media library views — smart views, sorts, facets and modified windows", () => {
  before(async function () {
    this.timeout(30_000);
    library = authorizedClient((await ensureOwnerSession()).accessToken);
  });

  describeSmartViews();
  describeViewSorts();
  describeFacets();
  describePaging();
  describeModifiedWindows();
});
