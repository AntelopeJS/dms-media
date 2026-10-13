import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import {
  GetPermissionId,
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import { RegisterAssetBinding } from "@antelopejs/interface-dms-media";
import { MEDIA_ROUTES } from "../../library/links";
import { uploadTextAsset } from "../helpers/assets";
import { authorizedClient } from "../helpers/http";
import { readPageAccess } from "../helpers/pages";
import {
  createRole,
  type MemberSession,
  registerMember,
} from "../helpers/members";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const SETUP_TIMEOUT_MS = 60_000;
const BINDING_ID = "editorial.article-pictures";
const FOLDER_NAME = "Article pictures";
const CONTENT_ROOT_NAME = "Content";

interface TreeFolderNode {
  id: string;
  name: string;
  parentId: string | null;
  shell: boolean;
  rights: { read: boolean; write: boolean; manage: boolean };
}

@RegisterPage()
class EditorialArticlesPage extends PageController("editorial-articles", {
  displayName: "Editorial articles",
  description: "Project page holding an asset field",
  icon: "i-ph-article",
  category: pagesCategory,
}) {
  static content = CustomComponent("dms-media-editorial-probe");
}

async function fetchFolders(client: AxiosInstance): Promise<TreeFolderNode[]> {
  const response = await client.get("/api/media/tree");
  expect(response.status, "tree").to.equal(HTTP_OK);
  return response.data.folders;
}

describe("[integration] media project field — a member uses media from a project page", () => {
  let owner: AxiosInstance;
  let editor: MemberSession;
  let linkedFolderId: string;

  before(async function () {
    this.timeout(SETUP_TIMEOUT_MS);
    RegisterAssetBinding({
      id: BINDING_ID,
      folderName: FOLDER_NAME,
      permissionsFromPage: EditorialArticlesPage,
    });
    owner = authorizedClient((await ensureOwnerSession()).accessToken);
    const pagePermission = GetPermissionId(EditorialArticlesPage);
    expect(pagePermission, "project page permission").to.be.a("string");
    const roleId = await createRole("editorial-editor", [
      pagePermission as string,
    ]);
    editor = await registerMember("EditorialEditor", [roleId]);
    const linked = (await fetchFolders(owner)).find(
      (folder) => folder.name === FOLDER_NAME,
    );
    expect(linked, "linked folder").to.not.equal(undefined);
    linkedFolderId = (linked as TreeFolderNode).id;
  });

  it("opens the linked folder of the page, and only it, to the picker", async () => {
    const folders = await fetchFolders(editor.client);
    const linked = folders.find((folder) => folder.id === linkedFolderId);
    expect(linked?.rights).to.deep.equal({
      read: true,
      write: true,
      manage: false,
    });
    const contentRoot = folders.find(
      (folder) => folder.name === CONTENT_ROOT_NAME && !folder.parentId,
    );
    expect(contentRoot?.shell, "content root is a shell").to.equal(true);
    expect(
      folders.filter((folder) => !folder.shell).map((folder) => folder.id),
    ).to.deep.equal([linkedFolderId]);
  });

  it("answers the folder of a binding without the tree, and nothing for an unknown one", async () => {
    const bound = await editor.client.get(
      `/api/media/bindings/${BINDING_ID}/folder`,
    );
    expect(bound.status).to.equal(HTTP_OK);
    expect(bound.data.folder.id).to.equal(linkedFolderId);
    expect(bound.data.folder.rights.write).to.equal(true);
    expect(bound.data.maxUploadBytes).to.be.a("number");
    const unknown = await editor.client.get(
      "/api/media/bindings/editorial.unknown/folder",
    );
    expect(unknown.status).to.equal(HTTP_OK);
    expect(unknown.data.folder).to.equal(null);
  });

  it("uploads into the linked folder and lists what it holds", async () => {
    const uploaded = await uploadTextAsset(
      editor.client,
      linkedFolderId,
      "article-notes.txt",
    );
    const listing = await editor.client.get(
      `/api/media/folders/${linkedFolderId}/assets`,
    );
    expect(listing.status).to.equal(HTTP_OK);
    expect(
      listing.data.assets.map((asset: { id: string }) => asset.id),
    ).to.include(uploaded.id);
  });

  it("refuses an upload anywhere else", async () => {
    const created = await owner.post("/api/media/folders", {
      name: "Editorial elsewhere",
    });
    expect(created.status).to.equal(HTTP_OK);
    const denied = await editor.client.post("/api/media/upload/presign", {
      folderId: created.data.id,
      filename: "nope.txt",
      size: 1,
      mimetype: "text/plain",
    });
    expect(denied.status).to.equal(HTTP_NOT_FOUND);
    await owner.delete(`/api/media/folders/${created.data.id}`);
  });

  it("keeps the module pages from the member: they are owner-only", async () => {
    const [memberAccess, ownerAccess] = await Promise.all([
      readPageAccess(editor.client, MEDIA_ROUTES.files),
      readPageAccess(owner, MEDIA_ROUTES.files),
    ]);
    expect(ownerAccess).to.include({
      ownRouteStatus: HTTP_OK,
      hasAccess: true,
    });
    expect(ownerAccess.servedBlocks).to.be.greaterThan(0);
    expect(memberAccess).to.include({ hasAccess: false, servedBlocks: 0 });
    expect(memberAccess.ownRouteStatus).to.not.equal(HTTP_OK);
  });
});
