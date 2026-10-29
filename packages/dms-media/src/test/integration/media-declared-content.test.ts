import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Schema } from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  DEFAULT_TENANT_ID,
  TENANT_SCHEMA_NAME,
} from "@antelopejs/interface-dms/constants";
import {
  EnsureMediaFolder,
  ImportMediaAsset,
  RegisterAssetBinding,
} from "@antelopejs/interface-dms-media";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import {
  MediaAssetModel,
  MediaDeclarationModel,
  MediaEventModel,
  MediaFolderModel,
} from "../../db";
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

  it("rejects missing or blank tenants before changing the default library", async () => {
    const declarationModel = GetModel(MediaDeclarationModel, DEFAULT_TENANT_ID);
    const eventModel = GetModel(MediaEventModel, DEFAULT_TENANT_ID);
    const before = {
      folders: await folders().getAll(),
      assets: await assets().getAll(),
      declarations: await declarationModel.getAll(),
      events: await eventModel.getAll(),
    };
    const folder = {
      key: "declared.invalid-tenant",
      name: "No implicit tenant",
    };
    const file = {
      key: "declared.invalid-tenant-file",
      folder: { binding: BINDING_ID },
      name: "invalid-tenant.png",
      mimetype: PNG_MIMETYPE,
      source: { bytes: ONE_PIXEL_PNG },
    };
    // These calls also fail compilation if the public contract becomes optional.
    // @ts-expect-error A JavaScript caller can omit the required tenantId.
    expect((await rejectionOf(EnsureMediaFolder(folder))).message).to.contain(
      "tenantId",
    );
    // @ts-expect-error A JavaScript caller can omit the required tenantId.
    expect((await rejectionOf(ImportMediaAsset(file))).message).to.contain(
      "tenantId",
    );
    for (const tenantId of ["", " \t\n "]) {
      expect(
        (await rejectionOf(EnsureMediaFolder({ ...folder, tenantId }))).message,
      ).to.contain("tenantId");
      expect(
        (await rejectionOf(ImportMediaAsset({ ...file, tenantId }))).message,
      ).to.contain("tenantId");
    }
    expect(
      (
        await rejectionOf(
          ImportMediaAsset({
            ...file,
            tenantId: "",
            source: { filePath: join(tempDir, "does-not-exist.png") },
          }),
        )
      ).message,
      "validation precedes source reads, not only the final database write",
    ).to.contain("tenantId");
    expect({
      folders: await folders().getAll(),
      assets: await assets().getAll(),
      declarations: await declarationModel.getAll(),
      events: await eventModel.getAll(),
    }).to.deep.equal(before);
  });

  it("isolates the same declaration keys in two tenant instances", async () => {
    const tenantId = "declared-isolation";
    const schema = Schema.get(TENANT_SCHEMA_NAME);
    if (!schema) throw new Error("Tenant schema is missing");
    // Disposable database fixture, not a change to workspace provisioning.
    await schema.createInstance(tenantId).run();
    try {
      const folder = {
        tenantId: DEFAULT_TENANT_ID,
        key: "declared.isolated",
        name: "Isolated",
      };
      const firstFolder = await EnsureMediaFolder(folder);
      const secondFolder = await EnsureMediaFolder({ ...folder, tenantId });
      expect(firstFolder.id).to.not.equal(secondFolder.id);
      const file = {
        tenantId: DEFAULT_TENANT_ID,
        key: folder.key,
        folder: { key: folder.key },
        name: "isolated.txt",
        mimetype: "text/plain",
        source: { bytes: Buffer.from("Initial") },
      };
      const firstFile = await ImportMediaAsset(file);
      const secondFile = await ImportMediaAsset({ ...file, tenantId });
      expect(firstFile.id).to.not.equal(secondFile.id);
      expect((await EnsureMediaFolder(folder)).status).to.equal("kept");
      expect((await ImportMediaAsset(file)).status).to.equal("kept");
      expect(
        await GetModel(MediaAssetModel, tenantId).get(firstFile.id as string),
      ).to.equal(undefined);
      expect(await assets().get(secondFile.id as string)).to.equal(undefined);
    } finally {
      await schema.destroyInstance(tenantId).run();
    }
  });

  describe("folders", () => {
    it("rejects self-parenting without blocking later declarations of the key", async () => {
      const key = "declared.self-parent";
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const error = await rejectionOf(
          Promise.race([
            EnsureMediaFolder({
              tenantId: DEFAULT_TENANT_ID,
              key,
              name: "Self",
              parent: key,
            }),
            new Promise((_, reject) => {
              timeout = setTimeout(
                () => reject(new Error("Declaration did not settle")),
                500,
              );
            }),
          ]),
        );
        expect(error.message).to.contain("cannot be its own parent");
        expect(
          (
            await EnsureMediaFolder({
              tenantId: DEFAULT_TENANT_ID,
              key,
              name: "Not self",
            })
          ).status,
        ).to.equal("created");
      } finally {
        clearTimeout(timeout);
      }
    });

    it("creates a folder once, however often it is declared", async () => {
      const declaration = {
        tenantId: DEFAULT_TENANT_ID,
        key: ROOT_KEY,
        name: "Declared procedures",
      };
      const first = await EnsureMediaFolder(declaration);
      const second = await EnsureMediaFolder(declaration);
      expect(first.status).to.equal("created");
      expect(second).to.deep.equal({ status: "kept", id: first.id });
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
        tenantId: DEFAULT_TENANT_ID,
        key: ROOT_KEY,
        name: "Declared procedures",
      });
      const child = await EnsureMediaFolder({
        tenantId: DEFAULT_TENANT_ID,
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

    it("never changes a folder declared before, even renamed by a member", async () => {
      const declared = await EnsureMediaFolder({
        tenantId: DEFAULT_TENANT_ID,
        key: "declared.renamed",
        name: "Declared templates",
      });
      const rename = await client.post(
        `/api/media/folders/${declared.id}/rename`,
        { name: "Our templates" },
      );
      expect(rename.status).to.equal(HTTP_OK);
      const result = await EnsureMediaFolder({
        tenantId: DEFAULT_TENANT_ID,
        key: "declared.renamed",
        name: "Declared templates v2",
      });
      expect(result).to.deep.equal({ status: "kept", id: declared.id });
      const folder = await folders().get(declared.id as string);
      expect(folder?.name).to.equal("Our templates");
    });

    it("refuses an invalid name, an unknown parent and a taken name", async () => {
      const badName = await rejectionOf(
        EnsureMediaFolder({
          tenantId: DEFAULT_TENANT_ID,
          key: "declared.bad",
          name: "a/b",
        }),
      );
      expect(badName.message).to.contain("declared.bad").and.contain("name");
      const orphan = await rejectionOf(
        EnsureMediaFolder({
          tenantId: DEFAULT_TENANT_ID,
          key: "declared.orphan",
          name: "Orphan",
          parent: "declared.missing",
        }),
      );
      expect(orphan.message).to.contain("declared.missing");
      const taken = await rejectionOf(
        EnsureMediaFolder({
          tenantId: DEFAULT_TENANT_ID,
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
        tenantId: DEFAULT_TENANT_ID,
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
      expect(second).to.deep.equal({ status: "kept", id: first.id });
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
        tenantId: DEFAULT_TENANT_ID,
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
        tenantId: DEFAULT_TENANT_ID,
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
          tenantId: DEFAULT_TENANT_ID,
          key: "declared.cover-notes",
          folder: { binding: BINDING_ID },
          name: "notes.txt",
          mimetype: "text/plain",
          source: { bytes: Buffer.from("notes") },
        }),
      );
      expect(refused.message).to.contain("only accepts image/*");
    });

    it("names the key when a lazy source fails or returns no bytes", async () => {
      const declaration = {
        tenantId: DEFAULT_TENANT_ID,
        folder: { key: ROOT_KEY },
        name: "lazy.txt",
        mimetype: "text/plain",
      };
      const thrown = await rejectionOf(
        ImportMediaAsset({
          ...declaration,
          key: "declared.lazy-throws",
          source: {
            load: () => {
              throw new Error("renderer crashed");
            },
          },
        }),
      );
      expect(thrown.message)
        .to.contain("declared.lazy-throws")
        .and.contain("renderer crashed");
      const wrong = await rejectionOf(
        ImportMediaAsset({
          ...declaration,
          key: "declared.lazy-wrong",
          source: {
            // @ts-expect-error A JavaScript caller can return something else.
            load: () => "text",
          },
        }),
      );
      expect(wrong.message).to.contain("must return a Uint8Array");
    });

    it("never changes a file declared before, nor reads its source again", async () => {
      const declaration = {
        tenantId: DEFAULT_TENANT_ID,
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
      let loads = 0;
      const result = await ImportMediaAsset({
        ...declaration,
        source: {
          load: () => {
            loads++;
            return Buffer.from("Manual v2");
          },
        },
      });
      expect(result).to.deep.equal({ status: "kept", id: first.id });
      expect(loads, "the source of a kept file is not read").to.equal(0);
      const asset = await assets().get(first.id as string);
      expect(asset?.name).to.equal("our-manual.txt");
      expect(asset?.size).to.equal("Manual v1".length);
    });

    it("refuses an unknown folder, a refused type and an unreadable image", async () => {
      const unknown = await rejectionOf(
        ImportMediaAsset({
          tenantId: DEFAULT_TENANT_ID,
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
          tenantId: DEFAULT_TENANT_ID,
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
          tenantId: DEFAULT_TENANT_ID,
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
          tenantId: DEFAULT_TENANT_ID,
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
