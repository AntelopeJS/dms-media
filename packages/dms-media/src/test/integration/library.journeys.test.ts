import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { z } from "zod";
import { uploadAsset } from "../helpers/assets";
import { createdBody, readBody } from "../helpers/bodies";
import { authorizedClient } from "../helpers/http";
import { solidJpeg } from "../helpers/library-journeys";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const PDF_MIMETYPE = "application/pdf";
const PDF_BODY = Buffer.from("%PDF-1.4\n");

const searchBody = z.object({
  assets: z.array(z.object({ id: z.string(), name: z.string() })),
  folders: z.array(z.object({ id: z.string(), name: z.string() })),
  total: z.number(),
});

let client: AxiosInstance;

async function folder(name: string, parentId?: string): Promise<string> {
  const created = await client.post("/api/media/folders", { name, parentId });
  expect(created.status, name).to.equal(HTTP_OK);
  return readBody(created, createdBody).id;
}

async function search(q: string, folderId?: string) {
  const response = await client.get("/api/media/search", {
    params: { q, folderId },
  });
  expect(response.status, q).to.equal(HTTP_OK);
  return readBody(response, searchBody);
}

describe("[integration] library journeys — search", () => {
  const ours = new Set<string>();
  const ourFolders = new Set<string>();
  let archives = "";
  let sub = "";
  let other = "";

  before(async function () {
    this.timeout(30_000);
    client = authorizedClient((await ensureOwnerSession()).accessToken);
    archives = await folder("Archives Été");
    sub = await folder("Sous-dossier", archives);
    other = await folder("Ailleurs");
    const photo = await uploadAsset(
      client,
      archives,
      "Été à Paris.jpg",
      "image/jpeg",
      await solidJpeg(4, 4),
    );
    await client.post(`/api/media/assets/${photo.id}/update`, {
      alt: "La tour Eiffel au crépuscule",
    });
    const final = await uploadAsset(
      client,
      sub,
      "rapport-final_v2.pdf",
      PDF_MIMETYPE,
      PDF_BODY,
    );
    const elsewhere = await uploadAsset(
      client,
      other,
      "rapport ailleurs.pdf",
      PDF_MIMETYPE,
      PDF_BODY,
    );
    for (const asset of [photo, final, elsewhere]) ours.add(asset.id);
    for (const id of [archives, sub, other]) ourFolders.add(id);
  });

  after(async () => {
    await client.delete(`/api/media/folders/${archives}`);
    await client.delete(`/api/media/folders/${other}`);
  });

  async function found(q: string, folderId?: string): Promise<string[]> {
    const answer = await search(q, folderId);
    return answer.assets
      .filter((asset) => ours.has(asset.id))
      .map((asset) => asset.name)
      .sort();
  }

  it("matches every word in any order across name, alt text and folder path, with at least one in the name or alt, ignoring accents, case and punctuation", async () => {
    const cases: [string, string[]][] = [
      ["ete paris", ["Été à Paris.jpg"]],
      ["PARIS été", ["Été à Paris.jpg"]],
      ["eiffel CREPUSCULE", ["Été à Paris.jpg"]],
      ["archives rapport", ["rapport-final_v2.pdf"]],
      ["rapport final v2", ["rapport-final_v2.pdf"]],
      ["archives", []],
      ["paris absent", []],
      ["rapport", ["rapport ailleurs.pdf", "rapport-final_v2.pdf"]],
    ];
    for (const [q, expected] of cases)
      expect(await found(q), JSON.stringify(q)).to.deep.equal(expected);
  });

  it("keeps a scoped search to the folder and its subfolders", async () => {
    expect(await found("rapport", archives)).to.deep.equal([
      "rapport-final_v2.pdf",
    ]);
  });

  it("matches folder names too", async () => {
    const hit = await search("sous dossier");
    expect(
      hit.folders.filter((entry) => ourFolders.has(entry.id)),
    ).to.deep.equal([{ id: sub, name: "Sous-dossier" }]);
  });

  it("finds nothing for an empty search", async () => {
    const empty = await search("   ");
    expect(empty.assets).to.deep.equal([]);
    expect(empty.folders).to.deep.equal([]);
  });
});
