import axios, { type AxiosInstance } from "axios";
import { expect } from "chai";
import { authorizedClient, createClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;

describe("[integration] media guards — every endpoint requires auth and rights", () => {
  let owner: AxiosInstance;

  before(async function () {
    this.timeout(40_000);
    const session = await ensureOwnerSession();
    owner = authorizedClient(session.accessToken);
  });

  it("rejects every anonymous media API call", async () => {
    const anonymous = createClient();
    const attempts = [
      anonymous.get("/api/media/tree"),
      anonymous.get("/api/media/assets"),
      anonymous.get("/api/media/assets/search?q=x"),
      anonymous.get("/api/media/assets/any"),
      anonymous.get("/api/media/assets/any/read-url"),
      anonymous.post("/api/media/assets/any/update", { alt: "x" }),
      anonymous.post("/api/media/assets/any/move", { folderId: "any" }),
      anonymous.post("/api/media/assets/any/visibility", {
        visibility: "public",
      }),
      anonymous.post("/api/media/assets/any/transform", { rotate: 90 }),
      anonymous.post("/api/media/assets/any/revert"),
      anonymous.delete("/api/media/assets/any"),
      anonymous.post("/api/media/folders", { name: "Sneaky" }),
      anonymous.get("/api/media/folders/any/assets"),
      anonymous.get("/api/media/folders/any/acl"),
      anonymous.put("/api/media/folders/any/acl", { entries: [] }),
      anonymous.post("/api/media/folders/any/rename", { name: "X" }),
      anonymous.post("/api/media/folders/any/move", { parentId: null }),
      anonymous.post("/api/media/folders/any/visibility", {
        visibility: "public",
      }),
      anonymous.delete("/api/media/folders/any"),
      anonymous.post("/api/media/upload/presign", {
        folderId: "any",
        filename: "x.txt",
        size: 1,
        mimetype: "text/plain",
      }),
      anonymous.post("/api/media/upload/confirm", {
        folderId: "any",
        resourceKey: "media/any/key.txt",
        filename: "x.txt",
      }),
      anonymous.post("/api/media/previews", { ids: ["any"] }),
    ];
    const responses = await Promise.all(attempts);
    for (const [index, response] of responses.entries()) {
      expect(response.status, `attempt #${index}`).to.equal(HTTP_UNAUTHORIZED);
    }
  });

  it("rejects oversized preview batches", async () => {
    const ids = Array.from({ length: 201 }, (_, index) => `ghost-${index}`);
    const previews = await owner.post("/api/media/previews", { ids });
    expect(previews.status).to.equal(HTTP_BAD_REQUEST);
  });

  it("hides unknown folders behind 404 for authorized users", async () => {
    const listing = await owner.get("/api/media/folders/does-not-exist/assets");
    expect(listing.status).to.equal(HTTP_NOT_FOUND);

    const presign = await owner.post("/api/media/upload/presign", {
      folderId: "does-not-exist",
      filename: "x.txt",
      size: 1,
      mimetype: "text/plain",
    });
    expect(presign.status).to.equal(HTTP_NOT_FOUND);
  });

  it("refuses to confirm uploads that are not staged keys", async () => {
    const folder = await owner.post("/api/media/folders", {
      name: "Guards",
    });
    expect(folder.status).to.equal(HTTP_OK);
    const confirm = await owner.post("/api/media/upload/confirm", {
      folderId: folder.data.id,
      resourceKey: "media/whatever/not-staged.txt",
      filename: "not-staged.txt",
    });
    expect(confirm.status).to.equal(HTTP_BAD_REQUEST);
    await owner.delete(`/api/media/folders/${folder.data.id}`);
  });

  it("filters unreadable assets out of previews instead of failing", async () => {
    const previews = await owner.post("/api/media/previews", {
      ids: ["ghost-1", "ghost-2"],
    });
    expect(previews.status).to.equal(HTTP_OK);
    expect(previews.data.previews).to.deep.equal({});
  });

  it("rejects a confirm whose staged key was presigned for another folder", async () => {
    const folderA = await owner.post("/api/media/folders", { name: "KeyA" });
    const folderB = await owner.post("/api/media/folders", { name: "KeyB" });
    const body = Buffer.from("cross-folder");
    const presign = await owner.post("/api/media/upload/presign", {
      folderId: folderA.data.id,
      filename: "x.txt",
      size: body.byteLength,
      mimetype: "text/plain",
    });
    expect(presign.status).to.equal(HTTP_OK);
    const put = await axios.put(presign.data.uploadUrl, body, {
      headers: presign.data.headers,
      validateStatus: () => true,
      transformRequest: [(data) => data],
    });
    expect(put.status).to.be.lessThan(300);
    const confirm = await owner.post("/api/media/upload/confirm", {
      folderId: folderB.data.id,
      resourceKey: presign.data.resourceKey,
      filename: "x.txt",
    });
    expect(confirm.status).to.equal(HTTP_BAD_REQUEST);
    await owner.delete(`/api/media/folders/${folderA.data.id}`);
    await owner.delete(`/api/media/folders/${folderB.data.id}`);
  });
});
