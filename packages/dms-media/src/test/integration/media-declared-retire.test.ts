import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import {
  EnsureMediaFolder,
  ImportMediaAsset,
  PruneMediaDeclarations,
  RetireMediaDeclaration,
} from "@antelopejs/interface-dms-media";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import {
  MediaAssetModel,
  MediaDeclarationModel,
  MediaEventModel,
  MediaFolderModel,
} from "../../db";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const PREFIX = "retire.";
const ROOT_KEY = "retire.root";
const tenantId = DEFAULT_TENANT_ID;

function folders() {
  return GetModel(MediaFolderModel, tenantId);
}

function assets() {
  return GetModel(MediaAssetModel, tenantId);
}

function declarations() {
  return GetModel(MediaDeclarationModel, tenantId);
}

async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error("Expected the call to be refused");
}

function textFile(key: string, folderKey: string, text: string) {
  return ImportMediaAsset({
    tenantId,
    key,
    folder: { key: folderKey },
    name: `${key.slice(PREFIX.length)}.txt`,
    mimetype: "text/plain",
    source: { bytes: Buffer.from(text) },
  });
}

/** The library rows still standing, deleting tombstones aside. */
async function liveAsset(id: string | undefined) {
  const asset = await assets().get(id as string);
  return asset && !asset.isDeleting ? asset : undefined;
}

describe("[integration] media declared content — retiring what the code no longer declares", () => {
  let client: AxiosInstance;

  before(async () => {
    client = authorizedClient((await ensureOwnerSession()).accessToken);
    await EnsureMediaFolder({ tenantId, key: ROOT_KEY, name: "Retired" });
  });

  after(async () => {
    const all = await folders().getAll();
    const root = all.find((folder) => folder.name === "Retired");
    if (root) await client.delete(`/api/media/folders/${root._id}`);
    const records = (await declarations().getAll()).filter((record) =>
      record.key.startsWith(PREFIX),
    );
    await Promise.all(
      records.map((record) => declarations().delete(record._id)),
    );
  });

  it("removes a file still as declared, once, and forgets its key", async () => {
    const file = await textFile("retire.untouched", ROOT_KEY, "Untouched");
    const retired = await RetireMediaDeclaration({
      tenantId,
      kind: "asset",
      key: "retire.untouched",
    });
    expect(retired).to.deep.equal({
      kind: "asset",
      key: "retire.untouched",
      status: "removed",
      id: file.id,
    });
    expect(await liveAsset(file.id)).to.equal(undefined);
    expect(
      await declarations().findByKey("asset", "retire.untouched"),
    ).to.equal(undefined);
    const events = await GetModel(MediaEventModel, tenantId).getBy(
      "kind",
      "asset.delete",
    );
    expect(events.some((event) => event.assetId === file.id)).to.equal(true);
    expect(
      (
        await RetireMediaDeclaration({
          tenantId,
          kind: "asset",
          key: "retire.untouched",
        })
      ).status,
    ).to.equal("unknown");
    // Declared again, the key creates new content.
    const again = await textFile("retire.untouched", ROOT_KEY, "Untouched");
    expect(again.status).to.equal("created");
    expect(again.id).to.not.equal(file.id);
  });

  it("leaves a file a member changed, and hands it over to them", async () => {
    const file = await textFile("retire.edited", ROOT_KEY, "Edited");
    const rename = await client.post(`/api/media/assets/${file.id}/update`, {
      name: "kept-by-member.txt",
    });
    expect(rename.status).to.equal(HTTP_OK);
    const retired = await RetireMediaDeclaration({
      tenantId,
      kind: "asset",
      key: "retire.edited",
    });
    expect(retired.status).to.equal("preserved");
    expect((await liveAsset(file.id))?.name).to.equal("kept-by-member.txt");
    expect(await declarations().findByKey("asset", "retire.edited")).to.equal(
      undefined,
    );
  });

  it("reports a file a member already deleted", async () => {
    const file = await textFile("retire.gone", ROOT_KEY, "Gone");
    await client.delete(`/api/media/assets/${file.id}`);
    expect(
      (
        await RetireMediaDeclaration({
          tenantId,
          kind: "asset",
          key: "retire.gone",
        })
      ).status,
    ).to.equal("deleted");
  });

  it("keeps a declared folder holding a member's file", async () => {
    const folder = await EnsureMediaFolder({
      tenantId,
      key: "retire.shared",
      name: "Shared",
      parent: ROOT_KEY,
    });
    await textFile("retire.shared-file", "retire.shared", "Shared");
    const memberFolder = await client.post("/api/media/folders", {
      name: "Member's",
      parentId: folder.id,
    });
    expect(memberFolder.status).to.equal(HTTP_OK);
    const results = await PruneMediaDeclarations({
      tenantId,
      prefix: "retire.shared",
      keep: [],
    });
    expect(
      results.map(({ kind, key, status }) => ({ kind, key, status })),
    ).to.deep.equal([
      { kind: "asset", key: "retire.shared-file", status: "removed" },
      { kind: "folder", key: "retire.shared", status: "preserved" },
    ]);
    expect(await folders().get(folder.id as string)).to.not.equal(undefined);
  });

  it("prunes the stale declarations of a prefix, files first and deepest folders first", async () => {
    await EnsureMediaFolder({
      tenantId,
      key: "retire.v1",
      name: "Version 1",
      parent: ROOT_KEY,
    });
    const nested = await EnsureMediaFolder({
      tenantId,
      key: "retire.v1.nested",
      name: "Nested",
      parent: "retire.v1",
    });
    const kept = await textFile("retire.v1.kept", "retire.v1", "Kept");
    const stale = await textFile("retire.v1.stale", "retire.v1", "Stale");
    const deep = await textFile("retire.v1.deep", "retire.v1.nested", "Deep");
    const results = await PruneMediaDeclarations({
      tenantId,
      prefix: "retire.v1",
      keep: ["retire.v1", "retire.v1.kept"],
    });
    expect(
      results.map(({ kind, key, status }) => ({ kind, key, status })),
    ).to.have.deep.members([
      { kind: "asset", key: "retire.v1.stale", status: "removed" },
      { kind: "asset", key: "retire.v1.deep", status: "removed" },
      { kind: "folder", key: "retire.v1.nested", status: "removed" },
    ]);
    expect(results.at(-1)?.kind).to.equal("folder");
    expect(await liveAsset(stale.id)).to.equal(undefined);
    expect(await liveAsset(deep.id)).to.equal(undefined);
    expect(await folders().get(nested.id as string)).to.equal(undefined);
    expect(await liveAsset(kept.id)).to.not.equal(undefined);
    // Pruning again finds nothing left to retire.
    expect(
      await PruneMediaDeclarations({
        tenantId,
        prefix: "retire.v1",
        keep: ["retire.v1", "retire.v1.kept"],
      }),
    ).to.deep.equal([]);
    expect(
      (await textFile("retire.v1.kept", "retire.v1", "Kept")).status,
    ).to.equal("unchanged");
  });

  it("refuses a blank prefix, an unknown kind and a missing tenant", async () => {
    expect(
      (
        await rejectionOf(
          PruneMediaDeclarations({ tenantId, prefix: " ", keep: [] }),
        )
      ).message,
    ).to.contain("prefix");
    expect(
      (
        await rejectionOf(
          RetireMediaDeclaration({
            tenantId,
            // @ts-expect-error A JavaScript caller can pass any kind.
            kind: "page",
            key: "retire.page",
          }),
        )
      ).message,
    ).to.contain("kind");
    expect(
      (
        await rejectionOf(
          RetireMediaDeclaration({
            tenantId: "",
            kind: "asset",
            key: "retire.no-tenant",
          }),
        )
      ).message,
    ).to.contain("tenantId");
  });
});
