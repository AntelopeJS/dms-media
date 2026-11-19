import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { z } from "zod";
import { rawGet, uploadTextAsset } from "../helpers/assets";
import { createdBody, readBody } from "../helpers/bodies";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_FOUND = 302;
const HTTP_UNAUTHORIZED = 401;
const BULK_LIMIT = 500;
const ERRORS = "$dms_media.errors.";

let client: AxiosInstance;

async function scratchFolder(name: string): Promise<string> {
  const created = await client.post("/api/media/folders", { name });
  expect(created.status, name).to.equal(HTTP_OK);
  return readBody(created, createdBody).id;
}

function unknownIds(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `id-${index}`);
}

function describeBulkJourney(): void {
  describe("bulk writes over the whole API", () => {
    it("publishes and hides files in bulk with the anonymous link following, then deletes them", async () => {
      const folder = await scratchFolder("Bulk journey");
      const target = await scratchFolder("Bulk journey target");
      try {
        const first = await uploadTextAsset(client, folder, "a.txt");
        const second = await uploadTextAsset(client, folder, "b.txt");
        const moved = await client.post("/api/media/assets/bulk/move", {
          ids: [first.id, second.id, "no-such-asset"],
          folderId: target,
        });
        expect(moved.data.done).to.deep.equal([first.id, second.id]);
        expect(moved.data.refused).to.have.length(1);
        expect(moved.data.refused[0]).to.include({
          id: "no-such-asset",
          status: HTTP_NOT_FOUND,
        });
        expect(moved.data.refused[0].message)
          .to.be.a("string")
          .with.length.above(0);

        const shown = await client.post("/api/media/assets/bulk/visibility", {
          ids: [first.id, "no-such-asset"],
          visibility: "public",
        });
        expect(shown.data.done).to.deep.equal([first.id]);
        expect((await rawGet(`/media/${first.id}/a.txt`)).status).to.equal(
          HTTP_FOUND,
        );
        const hidden = await client.post("/api/media/assets/bulk/visibility", {
          ids: [first.id],
          visibility: "private",
        });
        expect(hidden.data.done).to.deep.equal([first.id]);
        expect((await rawGet(`/media/${first.id}/a.txt`)).status).to.equal(
          HTTP_UNAUTHORIZED,
        );

        const malformed = await client.post("/api/media/assets/bulk/move", {
          ids: [first.id],
        });
        expect(malformed.status).to.equal(HTTP_BAD_REQUEST);
        expect(JSON.stringify(malformed.data)).to.contain(ERRORS);

        const removed = await client.post("/api/media/assets/bulk/delete", {
          ids: [first.id, second.id],
        });
        expect(removed.data.done).to.deep.equal([first.id, second.id]);
        expect(
          (await client.get(`/api/media/assets/${first.id}`)).status,
        ).to.equal(HTTP_NOT_FOUND);
      } finally {
        await client.delete(`/api/media/folders/${folder}`);
        await client.delete(`/api/media/folders/${target}`);
      }
    });

    it("takes up to 500 ids on every bulk route, refusing each unknown one, and 501 with an error key", async () => {
      const target = await scratchFolder("Bulk cap target");
      try {
        const routes = [
          { route: "move", body: { folderId: target } },
          { route: "visibility", body: { visibility: "public" } },
          { route: "delete", body: {} },
        ];
        for (const { route, body } of routes) {
          const url = `/api/media/assets/bulk/${route}`;
          const tooMany = await client.post(url, {
            ...body,
            ids: unknownIds(BULK_LIMIT + 1),
          });
          expect(tooMany.status, route).to.equal(HTTP_BAD_REQUEST);
          expect(JSON.stringify(tooMany.data), route).to.contain(ERRORS);
          const most = await client.post(url, {
            ...body,
            ids: unknownIds(BULK_LIMIT),
          });
          expect(most.status, route).to.equal(HTTP_OK);
          expect(most.data.done, route).to.deep.equal([]);
          expect(most.data.refused, route).to.have.length(BULK_LIMIT);
        }
      } finally {
        await client.delete(`/api/media/folders/${target}`);
      }
    });
  });
}

const STARTERS = ["Catalog", "Marketing", "Brand", "Documents"];
const rootFoldersBody = z.object({
  folders: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      parentId: z.string().nullable(),
      visibility: z.string(),
    }),
  ),
});

async function starterRoots() {
  const tree = await client.get("/api/media/tree");
  return readBody(tree, rootFoldersBody).folders.filter(
    (folder) => folder.parentId === null && STARTERS.includes(folder.name),
  );
}

function describeStarterFolders(): void {
  describe("starter folders", () => {
    it("creates the four starter folders at the root with their visibility, and refuses them a second time", async () => {
      const folders = STARTERS.map((name) => ({
        name,
        visibility: name === "Brand" ? "public" : "private",
      }));
      try {
        const created = await client.post("/api/media/folders/starter", {
          folders,
        });
        expect(created.status).to.equal(HTTP_OK);
        expect(
          (await starterRoots())
            .map((folder) => `${folder.name}:${folder.visibility}`)
            .sort((left, right) => left.localeCompare(right)),
        ).to.deep.equal([
          "Brand:public",
          "Catalog:private",
          "Documents:private",
          "Marketing:private",
        ]);
        const again = await client.post("/api/media/folders/starter", {
          folders,
        });
        expect(again.status).to.equal(HTTP_CONFLICT);
      } finally {
        for (const folder of await starterRoots())
          await client.delete(`/api/media/folders/${folder.id}`);
      }
    });
  });
}

describe("[integration] media bulk writes and starter folders", () => {
  before(async function () {
    this.timeout(30_000);
    client = authorizedClient((await ensureOwnerSession()).accessToken);
  });

  describeBulkJourney();
  describeStarterFolders();
});
