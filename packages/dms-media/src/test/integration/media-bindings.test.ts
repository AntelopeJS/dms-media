import {
  GetPermissionId,
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import type { AxiosInstance } from "axios";
import { assert, expect } from "chai";
import { RegisterAssetBinding } from "@antelopejs/interface-dms-media";
import { readBody } from "../helpers/bodies";
import { folderTreeBody, readFolderAcl } from "../helpers/folders";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
const BINDING_ID = "articles.cover";
const PAGE_BOUND_BINDING_ID = "articles.page-bound";
const PAGE_BOUND_FOLDER_NAME = "Page bound covers";

@RegisterPage()
class PageBoundProbePage extends PageController("page-bound-probe", {
  displayName: "Page bound probe",
  description: "Probe page for binding permission inheritance",
  icon: "i-ph-images",
  category: pagesCategory,
}) {
  static content = CustomComponent("dms-media-page-bound-probe");
}

describe("[integration] media bindings — linked folder provisioning", () => {
  let client: AxiosInstance;
  let contentRootId: string;
  let linkedFolderId: string;

  before(async function () {
    this.timeout(40_000);
    RegisterAssetBinding({
      id: BINDING_ID,
      folderName: "Article covers",
      permissionMapping: {
        read: ["articles.page"],
        write: ["articles.page.table.edit"],
      },
    });
    RegisterAssetBinding({
      id: PAGE_BOUND_BINDING_ID,
      folderName: PAGE_BOUND_FOLDER_NAME,
      permissionsFromPage: PageBoundProbePage,
    });
    const session = await ensureOwnerSession();
    client = authorizedClient(session.accessToken);
  });

  it("provisions the content root and the linked folder lazily", async () => {
    const tree = await client.get("/api/media/tree");
    expect(tree.status).to.equal(HTTP_OK);
    const folders = readBody(tree, folderTreeBody).folders;
    const contentRoot = folders.find(
      (folder) => folder.name === "Content" && folder.parentId === null,
    );
    assert.isDefined(contentRoot, "content root");
    contentRootId = contentRoot.id;
    const linked = folders.find((folder) => folder.name === "Article covers");
    assert.isDefined(linked, "linked folder");
    expect(linked.parentId).to.equal(contentRootId);
    expect(linked.bound).to.equal(true);
    linkedFolderId = linked.id;
  });

  it("does not duplicate provisioned folders on later requests", async () => {
    const first = await client.get("/api/media/tree");
    const second = await client.get("/api/media/tree");
    expect(second.data.folders.length).to.equal(first.data.folders.length);
    const bound = readBody(second, folderTreeBody).folders.filter(
      (folder) => folder.name === "Article covers",
    );
    expect(bound).to.have.length(1);
  });

  it("stores the derived permission mapping as the folder ACL", async () => {
    const entries = await readFolderAcl(linkedFolderId);
    expect(entries).to.deep.include({
      subject: { kind: "permission", id: "articles.page" },
      rights: ["read"],
    });
    expect(entries).to.deep.include({
      subject: { kind: "permission", id: "articles.page.table.edit" },
      rights: ["write"],
    });
  });

  it("derives the linked folder ACL from the owning page permission", async () => {
    const pagePermission = GetPermissionId(PageBoundProbePage);
    expect(pagePermission, "probe page permission").to.be.a("string");
    const tree = await client.get("/api/media/tree");
    const folder = readBody(tree, folderTreeBody).folders.find(
      (node) => node.name === PAGE_BOUND_FOLDER_NAME,
    );
    assert.isDefined(folder, "page-bound folder");
    const entries = await readFolderAcl(folder.id);
    expect(entries).to.deep.include({
      subject: { kind: "permission", id: pagePermission },
      rights: ["read"],
    });
    expect(entries).to.deep.include({
      subject: { kind: "permission", id: pagePermission },
      rights: ["write"],
    });
  });

  it("refuses to restructure linked folders", async () => {
    const renamed = await client.post(
      `/api/media/folders/${linkedFolderId}/rename`,
      { name: "Hijacked" },
    );
    expect(renamed.status).to.equal(HTTP_FORBIDDEN);

    const moved = await client.post(
      `/api/media/folders/${linkedFolderId}/move`,
      { parentId: null },
    );
    expect(moved.status).to.equal(HTTP_FORBIDDEN);

    const deleted = await client.delete(`/api/media/folders/${linkedFolderId}`);
    expect(deleted.status).to.equal(HTTP_FORBIDDEN);
  });

  it("provisions a freshly registered binding exactly once under concurrent requests", async () => {
    const PROBE_NAME = "Concurrent probe";
    const CONCURRENT_REQUESTS = 6;
    RegisterAssetBinding({
      id: "concurrent.probe",
      folderName: PROBE_NAME,
      permissionMapping: {},
    });
    const responses = await Promise.all(
      Array.from({ length: CONCURRENT_REQUESTS }, () =>
        client.get("/api/media/tree"),
      ),
    );
    for (const response of responses) {
      expect(response.status).to.equal(HTTP_OK);
    }
    const tree = await client.get("/api/media/tree");
    const probes = readBody(tree, folderTreeBody).folders.filter(
      (folder) => folder.name === PROBE_NAME,
    );
    expect(probes).to.have.length(1);
  });

  it("still allows uploads into the linked folder for authorized writers", async () => {
    const body = Buffer.from("cover bytes");
    const presign = await client.post("/api/media/upload/presign", {
      folderId: linkedFolderId,
      filename: "cover.txt",
      size: body.byteLength,
      mimetype: "text/plain",
    });
    expect(presign.status).to.equal(HTTP_OK);
  });
});
