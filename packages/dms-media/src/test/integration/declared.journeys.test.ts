import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import {
  EnsureMediaFolder,
  ImportMediaAsset,
  type MediaFolderDeclaration,
  RegisterAssetBinding,
} from "@antelopejs/interface-dms-media";
import type { AxiosInstance } from "axios";
import { assert, expect } from "chai";
import sharp from "sharp";
import { z } from "zod";
import { MediaAssetModel, MediaFolderModel } from "../../db";
import { PNG_MIMETYPE } from "../helpers/assets";
import { readBody } from "../helpers/bodies";
import { fetchFolderNodes } from "../helpers/folders";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const COVER_BINDING = "declared-journeys.cover";
const PROJECTS_BINDING = "declared-journeys.projects";
const LIBRARY_REFUSES_TYPE = "This type of file can't be added to the library";

const entriesBody = z.object({
  items: z.array(
    z.object({
      title: z.string(),
      params: z.record(z.unknown()),
    }),
  ),
});

const assetBody = z.object({
  asset: z.object({
    name: z.string(),
    alt: z.string().nullish(),
    width: z.number().nullish(),
    height: z.number().nullish(),
  }),
});

let client: AxiosInstance;

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
    assert.instanceOf(error, Error);
    return error;
  }
  throw new Error("Expected the declaration to be refused");
}

async function reasonOf(
  promise: Promise<unknown>,
  kind: "folder" | "file",
  key: string,
): Promise<string> {
  const prefix = `Media ${kind} '${key}': `;
  const message = (await rejectionOf(promise)).message;
  assert.isTrue(message.startsWith(prefix), message);
  return message.slice(prefix.length);
}

async function pngOf(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: "#336699" },
  })
    .png()
    .toBuffer();
}

function declareFolder(declaration: Omit<MediaFolderDeclaration, "tenantId">) {
  return EnsureMediaFolder({ tenantId: DEFAULT_TENANT_ID, ...declaration });
}

function describeWrittenOnce(): void {
  describe("a-declaration-is-written-once", () => {
    it("a-declaration-is-written-once: keeps a second declaration of a folder and a file without renaming, adding or reading again, and records the System's upload and folder in the activity", async () => {
      const key = "declared-journeys.once";
      const folder = await declareFolder({ key, name: "Procédures" });
      const again = await declareFolder({ key, name: "Another name" });
      expect(folder.status).to.equal("created");
      expect(again).to.deep.equal({ status: "kept", id: folder.id });
      const named = (await fetchFolderNodes(client)).filter(
        (node) => node.name === "Procédures" || node.name === "Another name",
      );
      expect(
        named.map((node) => node.name),
        "nothing is renamed or added",
      ).to.deep.equal(["Procédures"]);

      const bytes = await pngOf(640, 480);
      let loads = 0;
      const declaration = {
        tenantId: DEFAULT_TENANT_ID,
        key: `${key}.file`,
        folder: { key },
        name: "Plan été.png",
        mimetype: PNG_MIMETYPE,
        alt: "Plan du site",
        source: {
          load: () => {
            loads++;
            return bytes;
          },
        },
      };
      const asset = await ImportMediaAsset(declaration);
      expect(asset.status).to.equal("created");
      expect(loads, "the source of a new file is read once").to.equal(1);
      const assetAgain = await ImportMediaAsset({
        ...declaration,
        name: "Other.png",
      });
      expect(assetAgain).to.deep.equal({ status: "kept", id: asset.id });
      expect(loads, "the source of a kept file is not read again").to.equal(1);

      const read = readBody(
        await client.get(`/api/media/assets/${asset.id}`),
        assetBody,
      ).asset;
      expect(read).to.include({
        name: "Plan été.png",
        alt: "Plan du site",
        width: 640,
        height: 480,
      });
      expect((await assets().get(asset.id))?.size).to.equal(bytes.byteLength);

      const history = readBody(
        await client.get(`/api/media/assets/${asset.id}/history`),
        entriesBody,
      ).items;
      expect(history[0]?.title).to.equal("$dms_media.activity.asset_upload");
      expect(history[0]?.params.actor).to.equal("System");
      const activity = await client.get("/api/media/activity", {
        params: { type: "folders" },
      });
      expect(activity.status).to.equal(HTTP_OK);
      const created = JSON.stringify(readBody(activity, entriesBody).items);
      expect(created, "the folder creation is in the activity").to.contain(
        "Procédures",
      );
      expect(created, "attributed to System").to.contain("System");
    });
  });
}

function describePlacements(): void {
  describe("parents-bindings-visibility-and-acl", () => {
    it("parents-bindings-visibility-and-acl: places a folder at the root, under a declared parent named by a string or { key }, and under a binding that allows subfolders, and a file into a binding's folder", async () => {
      const key = "declared-journeys.tree";
      const root = await declareFolder({ key, name: "Root placements" });
      const byString = await declareFolder({
        key: `${key}.a`,
        name: "A",
        parent: key,
      });
      const byKey = await declareFolder({
        key: `${key}.b`,
        name: "B",
        parent: { key },
        visibility: "public",
      });
      const underBinding = await declareFolder({
        key: `${key}.c`,
        name: "Projet",
        parent: { binding: PROJECTS_BINDING },
      });
      const intoBinding = await ImportMediaAsset({
        tenantId: DEFAULT_TENANT_ID,
        key: `${key}.cover`,
        folder: { binding: COVER_BINDING },
        name: "cover.png",
        mimetype: PNG_MIMETYPE,
        source: { bytes: await pngOf(8, 8) },
      });
      const nodes = await fetchFolderNodes(client);
      const rowOf = (id: string) => nodes.find((node) => node.id === id);
      expect(rowOf(root.id)?.parentId, "at the root").to.equal(null);
      expect((await folders().get(root.id))?.visibility).to.equal("private");
      expect(rowOf(byString.id)?.parentId, "a parent as a string").to.equal(
        root.id,
      );
      expect(rowOf(byKey.id)?.parentId, "a parent as { key }").to.equal(
        root.id,
      );
      expect((await folders().get(byKey.id))?.visibility).to.equal("public");
      const projects = nodes.find((node) => node.binding === PROJECTS_BINDING);
      expect(rowOf(underBinding.id)?.parentId, "under the binding").to.equal(
        projects?.id,
      );
      const cover = nodes.find((node) => node.binding === COVER_BINDING);
      const file = readBody(
        await client.get(`/api/media/assets/${intoBinding.id}`),
        z.object({ asset: z.object({ folderId: z.string() }) }),
      );
      expect(intoBinding.status).to.equal("created");
      expect(file.asset.folderId, "a file into { binding }").to.equal(
        cover?.id,
      );
    });
  });
}

function describeLimits(): void {
  describe("the-limits-of-an-upload-apply", () => {
    it("the-limits-of-an-upload-apply: refuses an html page declared as text/html with the library's reason", async () => {
      await declareFolder({ key: "declared-journeys.limits", name: "Limits" });
      expect(
        await reasonOf(
          ImportMediaAsset({
            tenantId: DEFAULT_TENANT_ID,
            key: "declared-journeys.limits.html",
            folder: { key: "declared-journeys.limits" },
            name: "page.html",
            mimetype: "text/html",
            source: { bytes: Buffer.from("<p>") },
          }),
          "file",
          "declared-journeys.limits.html",
        ),
      ).to.equal(LIBRARY_REFUSES_TYPE);
    });
  });
}

function describeFolderBindings(): void {
  describe("folder-declarations-follow-the-dashboards-rules", () => {
    it("folder-declarations-follow-the-dashboards-rules: names the binding a folder is declared under when it is unregistered or takes no subfolders", async () => {
      const refusal = (key: string, binding: string) =>
        reasonOf(
          declareFolder({ key, name: key, parent: { binding } }),
          "folder",
          key,
        );
      expect(
        await refusal(
          "declared-journeys.nob",
          "declared-journeys.unregistered",
        ),
      ).to.equal(
        "no folder is bound to 'declared-journeys.unregistered': register the binding with AssetType or RegisterAssetBinding first",
      );
      expect(await refusal("declared-journeys.locked", COVER_BINDING)).to.equal(
        `the folder linked to '${COVER_BINDING}' cannot hold subfolders: register its binding with subfolders: true`,
      );
      const names = (await folders().getAll()).map((folder) => folder.name);
      expect(names).to.not.include("declared-journeys.nob");
      expect(names).to.not.include("declared-journeys.locked");
    });
  });
}

describe("[integration] media declared content — the HTTP journeys of the declared feature", () => {
  before(async function () {
    this.timeout(40_000);
    RegisterAssetBinding({
      id: COVER_BINDING,
      folderName: "Declared journeys covers",
      field: { mimetypes: ["image/*"] },
    });
    RegisterAssetBinding({
      id: PROJECTS_BINDING,
      folderName: "Declared journeys projects",
      subfolders: true,
      field: { mimetypes: ["image/*"] },
    });
    client = authorizedClient((await ensureOwnerSession()).accessToken);
  });

  describeWrittenOnce();
  describePlacements();
  describeLimits();
  describeFolderBindings();
});
