import { expect } from "chai";
import { z } from "zod";
import { uploadPixelPng } from "../helpers/assets";
import { createdBody, readBody } from "../helpers/bodies";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const RENAMES = 55;

const historyBody = z.object({
  items: z.array(z.object({ title: z.string() })),
});

describe("[integration] file history — every event of the file", () => {
  it("lists more than 50 events, the upload last", async function () {
    this.timeout(60_000);
    const session = await ensureOwnerSession();
    const client = authorizedClient(session.accessToken);
    const folderId = readBody(
      await client.post("/api/media/folders", { name: "File history spec" }),
      createdBody,
    ).id;
    const asset = await uploadPixelPng(client, folderId);
    for (let index = 1; index <= RENAMES; index += 1) {
      const rename = await client.post(`/api/media/assets/${asset.id}/update`, {
        name: `history-${index}.png`,
      });
      expect(rename.status, `rename ${index}`).to.equal(HTTP_OK);
    }
    const history = await client.get(`/api/media/assets/${asset.id}/history`);
    const titles = readBody(history, historyBody).items.map(
      (item) => item.title,
    );
    expect(titles).to.have.length(RENAMES + 1);
    expect(titles.at(-1)).to.equal("$dms_media.activity.asset_upload");
  });
});
