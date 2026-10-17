import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import {
  EnsureMediaFolder,
  ImportMediaAsset,
  RegisterAssetBinding,
} from "@antelopejs/interface-dms-media";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import sharp from "sharp";
import { MediaAssetModel, MediaEventModel, MediaFolderModel } from "../../db";
import { ONE_PIXEL_PNG, PNG_MIMETYPE } from "../helpers/assets";
import { readFolderAcl } from "../helpers/folders";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const BINDING_ID = "declared.covers";
const ROOT_KEY = "declared.procedures";
const CHILD_KEY = "declared.procedures.safety";
const ACL = [
  {
    subject: { kind: "permission" as const, id: "declared.page" },
    rights: ["read" as const],
  },
];

function folders() {
  return GetModel(MediaFolderModel, DEFAULT_TENANT_ID);
}

function assets() {
  return GetModel(MediaAssetModel, DEFAULT_TENANT_ID);
}

async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error("Expected the declaration to be refused");
}

function squarePng(size: number): Promise<Buffer> {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r: 240, g: 160, b: 0 },
    },
  })
    .png()
    .toBuffer();
}

describe("[integration] media declared content — folders and files shipped as code", () => {
  let client: AxiosInstance;
  let tempDir: string;

  before(async function () {
    this.timeout(40_000);
    RegisterAssetBinding({
      id: BINDING_ID,
      folderName: "Declared covers",
      field: { mimetypes: ["image/*"] },
    });
    const session = await ensureOwnerSession();
    client = authorizedClient(session.accessToken);
    tempDir = await mkdtemp(join(tmpdir(), "dms-media-declared-"));
  });

  after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("folders", () => {
    it("creates a folder once, however often it is declared", async () => {
      const declaration = { key: ROOT_KEY, name: "Declared procedures" };
      const first = await EnsureMediaFolder(declaration);
      const second = await EnsureMediaFolder(declaration);
      expect(first.status).to.equal("created");
      expect(second).to.deep.equal({ status: "unchanged", id: first.id });
      const folder = await folders().get(first.id as string);
      expect(folder?.name).to.equal("Declared procedures");
      expect(folder?.parentId ?? undefined).to.equal(undefined);
      expect(folder?.visibility).to.equal("private");
      const events = await GetModel(MediaEventModel, DEFAULT_TENANT_ID).getBy(
        "kind",
        "folder.create",
      );
      const created = events.filter((event) =>
        event.json_details?.includes(first.id as string),
      );
      expect(created).to.have.length(1);
      expect(created[0]?.actorName).to.equal("System");
    });

    it("nests a folder under a declared parent with its visibility and ACL", async () => {
      const parent = await EnsureMediaFolder({
        key: ROOT_KEY,
        name: "Declared procedures",
      });
      const child = await EnsureMediaFolder({
        key: CHILD_KEY,
        name: "Safety",
        parent: ROOT_KEY,
        visibility: "public",
        acl: ACL,
      });
      expect(child.status).to.equal("created");
      const folder = await folders().get(child.id as string);
      expect(folder?.parentId).to.equal(parent.id);
      expect(folder?.path).to.deep.equal([parent.id]);
      expect(folder?.visibility).to.equal("public");
      expect(await readFolderAcl(child.id as string)).to.deep.equal(ACL);
      const tree = await client.get("/api/media/tree");
      expect(tree.status).to.equal(HTTP_OK);
      expect(
        tree.data.folders.filter(
          (entry: { name: string }) => entry.name === "Safety",
        ),
      ).to.have.length(1);
    });

    it("refreshes a folder still as declared", async () => {
      const result = await EnsureMediaFolder({
        key: CHILD_KEY,
        name: "Safety rules",
        parent: ROOT_KEY,
      });
      expect(result.status).to.equal("updated");
      const folder = await folders().get(result.id as string);
      expect(folder?.name).to.equal("Safety rules");
      expect(folder?.visibility).to.equal("private");
      expect(await readFolderAcl(result.id as string)).to.equal(undefined);
    });

    it("leaves a folder a member renamed as they made it", async () => {
      const declared = await EnsureMediaFolder({
        key: "declared.renamed",
        name: "Declared templates",
      });
      const rename = await client.post(
        `/api/media/folders/${declared.id}/rename`,
        { name: "Our templates" },
      );
      expect(rename.status).to.equal(HTTP_OK);
      const result = await EnsureMediaFolder({
        key: "declared.renamed",
        name: "Declared templates v2",
      });
      expect(result).to.deep.equal({ status: "preserved", id: declared.id });
      const folder = await folders().get(declared.id as string);
      expect(folder?.name).to.equal("Our templates");
    });

    it("does not bring back a folder a member deleted", async () => {
      const declared = await EnsureMediaFolder({
        key: "declared.deleted",
        name: "Declared archive",
      });
      const removal = await client.delete(`/api/media/folders/${declared.id}`);
      expect(removal.status).to.equal(HTTP_OK);
      const result = await EnsureMediaFolder({
        key: "declared.deleted",
        name: "Declared archive",
      });
      expect(result).to.deep.equal({ status: "deleted" });
      const all = await folders().getAll();
      expect(all.some((folder) => folder.name === "Declared archive")).to.equal(
        false,
      );
    });

    it("refuses an invalid name, an unknown parent and a taken name", async () => {
      const badName = await rejectionOf(
        EnsureMediaFolder({ key: "declared.bad", name: "a/b" }),
      );
      expect(badName.message).to.contain("declared.bad").and.contain("name");
      const orphan = await rejectionOf(
        EnsureMediaFolder({
          key: "declared.orphan",
          name: "Orphan",
          parent: "declared.missing",
        }),
      );
      expect(orphan.message).to.contain("declared.missing");
      const taken = await rejectionOf(
        EnsureMediaFolder({
          key: "declared.twin",
          name: "declared PROCEDURES",
        }),
      );
      expect(taken.message).to.contain("already exists");
    });
  });

  describe("files", () => {
    it("imports bytes once, with their dimensions and an upload event", async () => {
      const declaration = {
        key: "declared.logo",
        folder: { key: ROOT_KEY },
        name: "logo.png",
        mimetype: PNG_MIMETYPE,
        alt: "Helio logo",
        source: { bytes: ONE_PIXEL_PNG },
      };
      const first = await ImportMediaAsset(declaration);
      const second = await ImportMediaAsset(declaration);
      expect(first.status).to.equal("created");
      expect(second).to.deep.equal({ status: "unchanged", id: first.id });
      const asset = await assets().get(first.id as string);
      expect(asset?.name).to.equal("logo.png");
      expect(asset?.alt).to.equal("Helio logo");
      expect(asset?.width).to.equal(1);
      expect(asset?.height).to.equal(1);
      expect(asset?.size).to.equal(ONE_PIXEL_PNG.byteLength);
      const events = await GetModel(
        MediaEventModel,
        DEFAULT_TENANT_ID,
      ).listByAsset(first.id as string);
      expect(events.map((event) => event.kind)).to.deep.equal(["asset.upload"]);
      const readUrl = await client.get(
        `/api/media/assets/${first.id}/read-url`,
      );
      expect(readUrl.status).to.equal(HTTP_OK);
      const stored = await fetch(readUrl.data.url);
      expect(Buffer.from(await stored.arrayBuffer())).to.deep.equal(
        ONE_PIXEL_PNG,
      );
    });

    it("imports a file from a local path", async () => {
      const filePath = join(tempDir, "checklist.txt");
      await writeFile(filePath, "1. Switch the inverter off");
      const result = await ImportMediaAsset({
        key: "declared.checklist",
        folder: { key: CHILD_KEY },
        name: "checklist.txt",
        mimetype: "text/plain",
        source: { filePath },
      });
      expect(result.status).to.equal("created");
      const asset = await assets().get(result.id as string);
      expect(asset?.mimetype).to.equal("text/plain");
      expect(asset?.width ?? undefined).to.equal(undefined);
    });

    it("imports into the folder bound to an asset field, with its types", async () => {
      const result = await ImportMediaAsset({
        key: "declared.cover",
        folder: { binding: BINDING_ID },
        name: "cover.png",
        mimetype: PNG_MIMETYPE,
        source: { bytes: ONE_PIXEL_PNG },
      });
      expect(result.status).to.equal("created");
      const asset = await assets().get(result.id as string);
      const bound = await folders().getByBinding(BINDING_ID);
      expect(asset?.folderId).to.equal(bound?._id);
      const refused = await rejectionOf(
        ImportMediaAsset({
          key: "declared.cover-notes",
          folder: { binding: BINDING_ID },
          name: "notes.txt",
          mimetype: "text/plain",
          source: { bytes: Buffer.from("notes") },
        }),
      );
      expect(refused.message).to.contain("only accepts image/*");
    });

    it("refreshes the content of a file still as declared", async () => {
      const declaration = {
        key: "declared.banner",
        folder: { key: ROOT_KEY },
        name: "banner.png",
        mimetype: PNG_MIMETYPE,
      };
      const first = await ImportMediaAsset({
        ...declaration,
        source: { bytes: await squarePng(2) },
      });
      const before = await assets().get(first.id as string);
      const second = await ImportMediaAsset({
        ...declaration,
        source: { bytes: await squarePng(3) },
      });
      expect(second).to.deep.equal({ status: "updated", id: first.id });
      const after = await assets().get(first.id as string);
      expect(after?.width).to.equal(3);
      expect(after?.storageKey).to.not.equal(before?.storageKey);
      const third = await ImportMediaAsset({
        ...declaration,
        source: { bytes: await squarePng(3) },
      });
      expect(third.status).to.equal("unchanged");
    });

    it("leaves a file a member renamed as they made it", async () => {
      const declaration = {
        key: "declared.manual",
        folder: { key: ROOT_KEY },
        name: "manual.txt",
        mimetype: "text/plain",
        source: { bytes: Buffer.from("Manual v1") },
      };
      const first = await ImportMediaAsset(declaration);
      const rename = await client.post(`/api/media/assets/${first.id}/update`, {
        name: "our-manual.txt",
      });
      expect(rename.status).to.equal(HTTP_OK);
      const result = await ImportMediaAsset({
        ...declaration,
        source: { bytes: Buffer.from("Manual v2") },
      });
      expect(result).to.deep.equal({ status: "preserved", id: first.id });
      const asset = await assets().get(first.id as string);
      expect(asset?.name).to.equal("our-manual.txt");
      expect(asset?.size).to.equal("Manual v1".length);
    });

    it("does not bring back a file a member deleted", async () => {
      const declaration = {
        key: "declared.flyer",
        folder: { key: ROOT_KEY },
        name: "flyer.txt",
        mimetype: "text/plain",
        source: { bytes: Buffer.from("Flyer") },
      };
      const first = await ImportMediaAsset(declaration);
      const removal = await client.delete(`/api/media/assets/${first.id}`);
      expect(removal.status).to.equal(HTTP_OK);
      const result = await ImportMediaAsset(declaration);
      expect(result).to.deep.equal({ status: "deleted" });
    });

    it("refuses an unknown folder, a refused type and an unreadable image", async () => {
      const unknown = await rejectionOf(
        ImportMediaAsset({
          key: "declared.lost",
          folder: { key: "declared.nowhere" },
          name: "lost.txt",
          mimetype: "text/plain",
          source: { bytes: Buffer.from("lost") },
        }),
      );
      expect(unknown.message).to.contain("declared.nowhere");
      const html = await rejectionOf(
        ImportMediaAsset({
          key: "declared.page",
          folder: { key: ROOT_KEY },
          name: "page.html",
          mimetype: "text/html",
          source: { bytes: Buffer.from("<p>hi</p>") },
        }),
      );
      expect(html.message).to.contain("can't be added");
      const broken = await rejectionOf(
        ImportMediaAsset({
          key: "declared.broken",
          folder: { key: ROOT_KEY },
          name: "broken.png",
          mimetype: PNG_MIMETYPE,
          source: { bytes: Buffer.from("not a png") },
        }),
      );
      expect(broken.message).to.contain("not a readable image");
      const missing = await rejectionOf(
        ImportMediaAsset({
          key: "declared.missing-file",
          folder: { key: ROOT_KEY },
          name: "missing.txt",
          mimetype: "text/plain",
          source: { filePath: join(tempDir, "missing.txt") },
        }),
      );
      expect(missing.message).to.contain("cannot read");
    });
  });
});
