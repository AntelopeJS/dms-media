import type { AxiosInstance } from "axios";
import { assert, expect } from "chai";
import { rawGet, uploadAsset } from "../helpers/assets";
import { aclFolder, memberHolding } from "../helpers/member-rights";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";
import { solidPng } from "../helpers/png";

const HTTP_FOUND = 302;
const HTTP_FORBIDDEN = 403;
const SETUP_TIMEOUT_MS = 40_000;
const PNG_SIDE = 20;
const READERS_PERMISSION = "delivery.readers";
const OTHERS_PERMISSION = "delivery.others";

let owner: AxiosInstance;
const folderIds: string[] = [];

async function readableBy(name: string, permission: string): Promise<string> {
  const id = await aclFolder(owner, name, permission, ["read"]);
  folderIds.push(id);
  return id;
}

describe("[integration] media delivery — the journeys of the link", () => {
  before(async function () {
    this.timeout(SETUP_TIMEOUT_MS);
    owner = authorizedClient((await ensureOwnerSession()).accessToken);
  });

  after(async () => {
    for (const id of folderIds) await owner.delete(`/api/media/folders/${id}`);
  });

  it("a-reader-of-the-folder-opens-a-private-file: a member whose role holds the permission a folder's ACL grants read is redirected to the stored bytes, and is refused the folder whose ACL names another permission", async () => {
    const readable = await readableBy("Readers", READERS_PERMISSION);
    const closed = await readableBy("Closed", OTHERS_PERMISSION);
    const bytes = await solidPng(PNG_SIDE, PNG_SIDE);
    const open = await uploadAsset(
      owner,
      readable,
      "open.png",
      "image/png",
      bytes,
    );
    const shut = await uploadAsset(
      owner,
      closed,
      "shut.png",
      "image/png",
      bytes,
    );
    const reader = await memberHolding("Reader", [READERS_PERMISSION]);
    const allowed = await rawGet(
      `/media/${open.id}/${encodeURIComponent(open.name)}`,
      reader.accessToken,
    );
    expect(allowed.status).to.equal(HTTP_FOUND);
    assert.isNotNull(allowed.location);
    const stored = await fetch(allowed.location);
    expect(Buffer.from(await stored.arrayBuffer()).equals(bytes)).to.equal(
      true,
    );
    const refused = await rawGet(
      `/media/${shut.id}/${encodeURIComponent(shut.name)}`,
      reader.accessToken,
    );
    expect(refused.status).to.equal(HTTP_FORBIDDEN);
  });
});
