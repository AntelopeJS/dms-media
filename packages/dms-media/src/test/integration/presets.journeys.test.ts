import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { z } from "zod";
import { rawGet, uploadAsset } from "../helpers/assets";
import { createdBody, readBody } from "../helpers/bodies";
import { authorizedClient } from "../helpers/http";
import { aclFolder, memberHolding } from "../helpers/member-rights";
import { ensureOwnerSession } from "../helpers/owner";
import { noisyImage } from "../helpers/renderings";

const HTTP_OK = 200;
const HTTP_FOUND = 302;
const READ_PERMISSION = "presets-journeys.reader";

const thumbRowBody = z.object({
  presets: z.array(
    z.object({
      id: z.string(),
      exampleUrl: z.string().nullable(),
      examplePreviewUrl: z.string().nullable(),
    }),
  ),
});

let owner: AxiosInstance;
let token: string;
let folderId: string;

async function readThumbRow(client: AxiosInstance) {
  const response = await client.get("/api/media/presets");
  expect(response.status).to.equal(HTTP_OK);
  const row = readBody(response, thumbRowBody).presets.find(
    (preset) => preset.id === "thumb",
  );
  expect(row, "the thumb size").to.not.equal(undefined);
  return row;
}

describe("[integration] presets journeys — rendering redirects and image examples", () => {
  before(async function () {
    this.timeout(40_000);
    token = (await ensureOwnerSession()).accessToken;
    owner = authorizedClient(token);
    const folder = await owner.post("/api/media/folders", {
      name: "Presets journeys",
    });
    expect(folder.status).to.equal(HTTP_OK);
    folderId = readBody(folder, createdBody).id;
  });

  after(async () => {
    await owner.delete(`/api/media/folders/${folderId}`);
  });

  it("default-sizes-render-on-first-request: the redirect to a rendering is never cached, instead of a redirect a browser may keep", async () => {
    const photo = await uploadAsset(
      owner,
      folderId,
      "petite été.jpg",
      "image/jpeg",
      await noisyImage(800, 600, "jpeg"),
    );
    const redirect = await rawGet(
      `/media/${photo.id}/thumb/${encodeURIComponent(photo.name)}`,
      token,
    );
    expect(redirect.status).to.equal(HTTP_FOUND);
    expect(redirect.cacheControl).to.equal("no-store");
  });

  it("the-sizes-api-gives-copyable-examples: a library that reads no image has no example, then one built on its only private image", async () => {
    const readable = await aclFolder(
      owner,
      "Presets journeys readable",
      READ_PERMISSION,
      ["read"],
    );
    try {
      const member = await memberHolding("PresetsReader", [READ_PERMISSION]);
      const none = await readThumbRow(member.client);
      expect(none?.exampleUrl).to.equal(null);
      expect(none?.examplePreviewUrl).to.equal(null);
      const photo = await uploadAsset(
        owner,
        readable,
        "exemple été.png",
        "image/png",
        await noisyImage(50, 40, "png"),
      );
      const path = `/media/${photo.id}/thumb/${encodeURIComponent(photo.name)}`;
      const privateOnly = await readThumbRow(member.client);
      expect(privateOnly?.examplePreviewUrl).to.equal(path);
      expect(privateOnly?.exampleUrl?.endsWith(path)).to.equal(true);
    } finally {
      await owner.delete(`/api/media/folders/${readable}`);
    }
  });
});
