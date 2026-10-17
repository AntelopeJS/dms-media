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
import sharp from "sharp";
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
    // Validation also precedes source reads, not only the final database write.
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
    ).to.contain("tenantId");
    expect({
      folders: await folders().getAll(),
      assets: await assets().getAll(),
      declarations: await declarationModel.getAll(),
      events: await eventModel.getAll(),
    }).to.deep.equal(before);
  });

  it("isolates the same declaration keys and updates in two tenant instances", async () => {
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
      expect(
        (
          await EnsureMediaFolder({
            ...folder,
            tenantId,
            name: "Other tenant folder",
          })
        ).status,
      ).to.equal("updated");
      expect(
        (
          await ImportMediaAsset({
            ...file,
            tenantId,
            source: { bytes: Buffer.from("Other tenant content") },
          })
        ).status,
      ).to.equal("updated");
      expect((await EnsureMediaFolder(folder)).status).to.equal("unchanged");
      expect((await ImportMediaAsset(file)).status).to.equal("unchanged");
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

    it("rejects moving a declared ancestor under its descendant", async () => {
      const root = {
        tenantId: DEFAULT_TENANT_ID,
        key: "declared.cycle-root",
        name: "Cycle root",
      };
      const parent = await EnsureMediaFolder(root);
      const child = await EnsureMediaFolder({
        tenantId: DEFAULT_TENANT_ID,
        key: "declared.cycle-child",
        name: "Cycle child",
        parent: root.key,
      });
      const error = await rejectionOf(
        EnsureMediaFolder({ ...root, parent: "declared.cycle-child" }),
      );
      expect(error.message).to.contain("inside itself");
      expect((await folders().get(parent.id as string))?.path).to.deep.equal(
        [],
      );
      expect((await folders().get(child.id as string))?.path).to.deep.equal([
        parent.id,
      ]);
      const destination = await EnsureMediaFolder({
        tenantId: DEFAULT_TENANT_ID,
        key: "declared.move-target",
        name: "Move target",
      });
      expect(
        (await EnsureMediaFolder({ ...root, parent: "declared.move-target" }))
          .status,
      ).to.equal("updated");
      expect((await folders().get(child.id as string))?.path).to.deep.equal([
        destination.id,
        parent.id,
      ]);
      expect((await EnsureMediaFolder(root)).status).to.equal("updated");
      expect(
        (await folders().get(parent.id as string))?.parentId ?? undefined,
      ).to.equal(undefined);
      expect((await folders().get(child.id as string))?.path).to.deep.equal([
        parent.id,
      ]);
    });

    it("preserves a member rename racing a folder refresh", async () => {
      const declaration = {
        tenantId: DEFAULT_TENANT_ID,
        key: "declared.folder-race",
        name: "Folder before race",
      };
      const first = await EnsureMediaFolder(declaration);
      // oxlint-disable-next-line typescript/unbound-method -- Rebound with call(this) below and restored in finally.
      const original = MediaFolderModel.prototype.get;
      let renamed = false;
      MediaFolderModel.prototype.get = async function (id) {
        const snapshot = await original.call(this, id);
        if (id === first.id && !renamed) {
          renamed = true;
          await client.post(`/api/media/folders/${id}/rename`, {
            name: "Member folder name",
          });
        }
        return snapshot;
      };
      try {
        const result = await EnsureMediaFolder({
          ...declaration,
          name: "Code folder name",
          visibility: "public",
        });
        expect(result).to.deep.equal({ status: "preserved", id: first.id });
        const folder = await folders().get(first.id as string);
        expect(folder?.name).to.equal("Member folder name");
        expect(folder?.visibility).to.equal("private");
        expect((await EnsureMediaFolder(declaration)).status).to.equal(
          "preserved",
        );
      } finally {
        MediaFolderModel.prototype.get = original;
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

    it("refreshes a folder still as declared", async () => {
      const result = await EnsureMediaFolder({
        tenantId: DEFAULT_TENANT_ID,
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
      expect(result).to.deep.equal({ status: "preserved", id: declared.id });
      const folder = await folders().get(declared.id as string);
      expect(folder?.name).to.equal("Our templates");
    });

    it("does not bring back a folder a member deleted", async () => {
      const declared = await EnsureMediaFolder({
        tenantId: DEFAULT_TENANT_ID,
        key: "declared.deleted",
        name: "Declared archive",
      });
      const removal = await client.delete(`/api/media/folders/${declared.id}`);
      expect(removal.status).to.equal(HTTP_OK);
      const result = await EnsureMediaFolder({
        tenantId: DEFAULT_TENANT_ID,
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
    for (const replaceBytes of [false, true]) {
      it(`preserves a member rename racing an asset ${replaceBytes ? "content" : "metadata"} refresh`, async () => {
        const declaration = {
          tenantId: DEFAULT_TENANT_ID,
          key: `declared.asset-race.${replaceBytes}`,
          folder: { key: ROOT_KEY },
          name: `race-${replaceBytes}.txt`,
          mimetype: "text/plain",
          source: { bytes: Buffer.from("Original content") },
        };
        const first = await ImportMediaAsset(declaration);
        const before = await assets().get(first.id as string);
        // oxlint-disable-next-line typescript/unbound-method -- Rebound with call(this) below and restored in finally.
        const original = MediaAssetModel.prototype.get;
        let reads = 0;
        MediaAssetModel.prototype.get = async function (id) {
          const snapshot = await original.call(this, id);
          // Race the last snapshot used to publish, not just the initial verdict.
          if (id === first.id && ++reads === 2) {
            await client.post(`/api/media/assets/${id}/update`, {
              name: `member-${replaceBytes}.txt`,
            });
          }
          return snapshot;
        };
        try {
          const result = await ImportMediaAsset({
            ...declaration,
            name: `code-${replaceBytes}.txt`,
            source: replaceBytes
              ? { bytes: Buffer.from("Replacement content") }
              : declaration.source,
          });
          expect(result).to.deep.equal({ status: "preserved", id: first.id });
          const after = await assets().get(first.id as string);
          expect(after?.name).to.equal(`member-${replaceBytes}.txt`);
          expect(after?.storageKey).to.equal(before?.storageKey);
          expect((await ImportMediaAsset(declaration)).status).to.equal(
            "preserved",
          );
        } finally {
          MediaAssetModel.prototype.get = original;
        }
      });
    }

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

    it("refreshes the content of a file still as declared", async () => {
      const declaration = {
        tenantId: DEFAULT_TENANT_ID,
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

    it("does not read the source while the caller's version is unchanged", async () => {
      let loads = 0;
      const load = (text: string) => () => {
        loads++;
        return Buffer.from(text);
      };
      const declaration = {
        tenantId: DEFAULT_TENANT_ID,
        key: "declared.generated",
        folder: { key: ROOT_KEY },
        name: "generated.txt",
        mimetype: "text/plain",
      };
      const first = await ImportMediaAsset({
        ...declaration,
        version: "v1",
        source: { load: load("Generated v1") },
      });
      expect(first.status).to.equal("created");
      expect(loads).to.equal(1);
      // Same version: neither the loader nor a file path that does not exist is read.
      expect(
        await ImportMediaAsset({
          ...declaration,
          version: "v1",
          source: { load: load("never read") },
        }),
      ).to.deep.equal({ status: "unchanged", id: first.id });
      expect(
        (
          await ImportMediaAsset({
            ...declaration,
            version: "v1",
            source: { filePath: join(tempDir, "never-written.txt") },
          })
        ).status,
      ).to.equal("unchanged");
      expect(loads).to.equal(1);
      // New metadata under the same version refreshes without reading the bytes.
      const renamed = await ImportMediaAsset({
        ...declaration,
        version: "v1",
        name: "generated-renamed.txt",
        source: { load: load("never read") },
      });
      expect(renamed).to.deep.equal({ status: "updated", id: first.id });
      expect(loads).to.equal(1);
      const updated = await ImportMediaAsset({
        ...declaration,
        version: "v2",
        name: "generated-renamed.txt",
        source: { load: load("Generated v2") },
      });
      expect(updated).to.deep.equal({ status: "updated", id: first.id });
      expect(loads).to.equal(2);
      const asset = await assets().get(first.id as string);
      expect(asset?.size).to.equal("Generated v2".length);
    });

    it("reads a new version once, and not again when its bytes did not change", async () => {
      let loads = 0;
      const declaration = {
        tenantId: DEFAULT_TENANT_ID,
        key: "declared.rebuilt",
        folder: { key: ROOT_KEY },
        name: "rebuilt.txt",
        mimetype: "text/plain",
        source: {
          load: async () => {
            loads++;
            return Buffer.from("Same bytes");
          },
        },
      };
      const first = await ImportMediaAsset({ ...declaration, version: "a" });
      const rebuilt = await ImportMediaAsset({ ...declaration, version: "b" });
      expect(rebuilt).to.deep.equal({ status: "unchanged", id: first.id });
      expect(loads).to.equal(2);
      expect(
        (await ImportMediaAsset({ ...declaration, version: "b" })).status,
      ).to.equal("unchanged");
      expect(loads).to.equal(2);
    });

    it("does not read the source of a file a member changed or deleted", async () => {
      let loads = 0;
      const declaration = {
        tenantId: DEFAULT_TENANT_ID,
        key: "declared.untouchable",
        folder: { key: ROOT_KEY },
        name: "untouchable.txt",
        mimetype: "text/plain",
        source: {
          load: () => {
            loads++;
            return Buffer.from(`Untouchable ${loads}`);
          },
        },
      };
      const first = await ImportMediaAsset(declaration);
      await client.post(`/api/media/assets/${first.id}/update`, {
        name: "member-owned.txt",
      });
      expect((await ImportMediaAsset(declaration)).status).to.equal(
        "preserved",
      );
      await client.delete(`/api/media/assets/${first.id}`);
      expect((await ImportMediaAsset(declaration)).status).to.equal("deleted");
      expect(loads).to.equal(1);
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

    it("leaves a file a member renamed as they made it", async () => {
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
        tenantId: DEFAULT_TENANT_ID,
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
