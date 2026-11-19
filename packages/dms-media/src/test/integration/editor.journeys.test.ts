import type { AxiosInstance } from "axios";
import { expect } from "chai";
import sharp from "sharp";
import { z } from "zod";
import { uploadAsset } from "../helpers/assets";
import { createdBody, readBody } from "../helpers/bodies";
import { follow } from "../helpers/delivery";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const SETUP_TIMEOUT_MS = 40_000;
const BANNER_WIDTH = 300;
const BANNER_HEIGHT = 100;

function asOwner() {
  return { Authorization: `Bearer ${token}` };
}

const copiedBody = z.object({
  asset: z.object({ id: z.string(), name: z.string(), folderId: z.string() }),
});

let client: AxiosInstance;
let token = "";
let folderId: string;

describe("[integration] media editor — the journeys of Save as copy", () => {
  before(async function () {
    this.timeout(SETUP_TIMEOUT_MS);
    token = (await ensureOwnerSession()).accessToken;
    client = authorizedClient(token);
    const folder = await client.post("/api/media/folders", { name: "Copies" });
    expect(folder.status).to.equal(HTTP_OK);
    folderId = readBody(folder, createdBody).id;
  });

  after(async () => {
    await client.delete(`/api/media/folders/${folderId}`);
  });

  it("save-as-copy-leaves-the-source-untouched: a copy is the one new file of the folder and is the crop, while the source keeps its bytes", async () => {
    const bytes = await sharp({
      create: {
        width: BANNER_WIDTH,
        height: BANNER_HEIGHT,
        channels: 3,
        background: "#3366cc",
      },
    })
      .jpeg()
      .toBuffer();
    const source = await uploadAsset(
      client,
      folderId,
      "bandeau.jpg",
      "image/jpeg",
      bytes,
    );
    const copy = await client.post(
      `/api/media/assets/${source.id}/transform/copy`,
      { crop: { x: 0, y: 0, width: 0.5, height: 1 } },
    );
    expect(copy.status).to.equal(HTTP_OK);
    const made = readBody(copy, copiedBody).asset;
    expect(made.id).to.not.equal(source.id);
    expect(made.folderId).to.equal(folderId);
    const listing = await client.get(`/api/media/folders/${folderId}/assets`);
    const listed = readBody(
      listing,
      z.object({ assets: z.array(createdBody) }),
    ).assets.map((asset) => asset.id);
    expect(listed).to.have.members([source.id, made.id]);
    const served = await follow(
      `/media/${made.id}/${encodeURIComponent(made.name)}`,
      asOwner(),
    );
    const metadata = await sharp(served.body).metadata();
    expect([metadata.width, metadata.height]).to.deep.equal([
      BANNER_WIDTH / 2,
      BANNER_HEIGHT,
    ]);
    const kept = await follow(`/media/${source.id}/bandeau.jpg`, asOwner());
    expect(kept.body.equals(bytes)).to.equal(true);
  });
});
