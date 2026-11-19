import {
  GetPermissionId,
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { serializeType } from "@antelopejs/interface-dms/base/data-types";
import type { AxiosInstance } from "axios";
import { assert, expect } from "chai";
import { z } from "zod";
import {
  AssetType,
  RegisterAssetBinding,
  UnregisterAssetBinding,
} from "@antelopejs/interface-dms-media";
import { uploadTextAsset } from "../helpers/assets";
import { createdBody, readBody } from "../helpers/bodies";
import { folderTreeBody, readFolderAcl } from "../helpers/folders";
import { authorizedClient } from "../helpers/http";
import { createRole, registerMember } from "../helpers/members";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
const BINDING_ID = "articles.cover";
const PAGE_BOUND_BINDING_ID = "articles.page-bound";
const PAGE_BOUND_FOLDER_NAME = "Page bound covers";
const SHEETS_BINDING_ID = "articles.sheets";
const SUBFOLDERS_BINDING_ID = "articles.projects";
const FIELD_BINDING_ID = "articles.field";
const MAX_UPLOAD_BYTES = 524_288_000;
const BOUND_PARENT_ERROR = "$dms_media.errors.bound_parent";

const boundFolderBody = z.object({
  folder: z.object({ id: z.string(), binding: z.string().nullable() }),
  maxUploadBytes: z.number(),
  allowedMimetypes: z.array(z.string()),
});

const visibleTreeBody = z.object({
  folders: z.array(
    folderTreeBody.shape.folders.element.extend({ visibility: z.string() }),
  ),
});

@RegisterPage()
class SubfolderProbePage extends PageController("subfolder-probe", {
  displayName: "Subfolder probe",
  icon: "i-ph-images",
  category: pagesCategory,
}) {
  static content = CustomComponent("dms-media-subfolder-probe");
}

@RegisterPage()
class OpenProbePage extends PageController("open-probe", {
  displayName: "Open probe",
  icon: "i-ph-images",
  category: pagesCategory,
  memberAccess: true,
}) {
  static content = CustomComponent("dms-media-open-probe");
}

/** What a member can do in a folder: list it (read) and presign into it (write). */
async function probeRights(
  member: AxiosInstance,
  folderId: string,
): Promise<{ read: boolean; write: boolean }> {
  const listed = await member.get(`/api/media/folders/${folderId}/assets`);
  const presign = await member.post("/api/media/upload/presign", {
    folderId,
    filename: "probe.txt",
    size: 5,
    mimetype: "text/plain",
  });
  return { read: listed.status === HTTP_OK, write: presign.status === HTTP_OK };
}

@RegisterPage()
class PageBoundProbePage extends PageController("page-bound-probe", {
  displayName: "Page bound probe",
  description: "Probe page for binding permission inheritance",
  icon: "i-ph-images",
  category: pagesCategory,
}) {
  static content = CustomComponent("dms-media-page-bound-probe");
}

function registerProbeBindings(): void {
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
  RegisterAssetBinding({
    id: SHEETS_BINDING_ID,
    field: { mimetypes: ["application/pdf"] },
  });
  RegisterAssetBinding({
    id: SUBFOLDERS_BINDING_ID,
    folderName: "Article projects",
    subfolders: true,
    permissionsFromPage: SubfolderProbePage,
  });
}

describe("[integration] media bindings — linked folder provisioning", () => {
  let client: AxiosInstance;
  let contentRootId: string;
  let linkedFolderId: string;

  before(async function () {
    this.timeout(40_000);
    registerProbeBindings();
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

describe("[integration] media bindings — what a linked folder shows and locks", () => {
  let client: AxiosInstance;
  let linkedFolderId: string;

  before(async function () {
    this.timeout(40_000);
    registerProbeBindings();
    client = authorizedClient((await ensureOwnerSession()).accessToken);
    const tree = await client.get("/api/media/tree");
    linkedFolderId =
      readBody(tree, folderTreeBody).folders.find(
        (folder) => folder.name === "Article covers",
      )?.id ?? "";
  });

  it("keeps the content root and bound folders private, naming a folder by its binding id without a folder name", async () => {
    const tree = await client.get("/api/media/tree");
    const folders = readBody(tree, visibleTreeBody).folders;
    const contentRoot = folders.find(
      (folder) => folder.name === "Content" && folder.parentId === null,
    );
    expect(contentRoot).to.include({ visibility: "private", parentId: null });
    const sheets = folders.find(
      (folder) => folder.binding === SHEETS_BINDING_ID,
    );
    assert.isDefined(sheets, "folder of a binding without a folder name");
    expect(sheets).to.include({
      name: SHEETS_BINDING_ID,
      parentId: contentRoot?.id,
      visibility: "private",
    });
    expect(sheets.accepts).to.deep.equal(["application/pdf"]);
  });

  it("answers the folder of a binding with the upload limits", async () => {
    const answer = await client.get(
      `/api/media/bindings/${SHEETS_BINDING_ID}/folder`,
    );
    expect(answer.status).to.equal(HTTP_OK);
    const body = readBody(answer, boundFolderBody);
    expect(body.folder.binding).to.equal(SHEETS_BINDING_ID);
    expect(body.maxUploadBytes).to.equal(MAX_UPLOAD_BYTES);
    expect(body.allowedMimetypes).to.be.an("array");
  });

  it("refuses a folder moved into a linked folder as bound_parent", async () => {
    const created = await client.post("/api/media/folders", {
      name: "Moving in",
    });
    expect(created.status).to.equal(HTTP_OK);
    const moved = await client.post(
      `/api/media/folders/${readBody(created, createdBody).id}/move`,
      { parentId: linkedFolderId },
    );
    expect(moved.status).to.equal(HTTP_FORBIDDEN);
    expect(moved.data).to.equal(BOUND_PARENT_ERROR);
  });

  it("renames a subfolder of an allowing binding, whose own folder stays locked", async () => {
    const tree = await client.get("/api/media/tree");
    const projects = readBody(tree, folderTreeBody).folders.find(
      (folder) => folder.binding === SUBFOLDERS_BINDING_ID,
    );
    assert.isDefined(projects, "folder of the binding allowing subfolders");
    const created = await client.post("/api/media/folders", {
      name: "Projet 1",
      parentId: projects.id,
    });
    expect(created.status).to.equal(HTTP_OK);
    const renamed = await client.post(
      `/api/media/folders/${readBody(created, createdBody).id}/rename`,
      { name: "Projet un" },
    );
    expect(renamed.status).to.equal(HTTP_OK);
    const own = await client.post(`/api/media/folders/${projects.id}/rename`, {
      name: "Nope",
    });
    expect(own.status).to.equal(HTTP_FORBIDDEN);
  });
});

async function boundFolderId(
  owner: AxiosInstance,
  bindingId: string,
): Promise<string> {
  const answer = await owner.get(`/api/media/bindings/${bindingId}/folder`);
  expect(answer.status).to.equal(HTTP_OK);
  return readBody(answer, boundFolderBody).folder.id;
}

describe("[integration] media bindings — registration of a binding", () => {
  let owner: AxiosInstance;

  before(async function () {
    this.timeout(60_000);
    registerProbeBindings();
    owner = authorizedClient((await ensureOwnerSession()).accessToken);
  });

  it("replaces a binding registered twice: the same folder keeps its name and takes the new ACL, and unregistering leaves it with its files", async () => {
    const id = "articles.runtime";
    RegisterAssetBinding({
      id,
      folderName: "Runtime A",
      acl: [
        {
          subject: { kind: "permission", id: "runtime.old" },
          rights: ["write"],
        },
      ],
    });
    const folderId = await boundFolderId(owner, id);
    const oldHolder = await registerMember("RuntimeOld", [
      await createRole("runtime-old", ["runtime.old"]),
    ]);
    const newHolder = await registerMember("RuntimeNew", [
      await createRole("runtime-new", ["runtime.new"]),
    ]);
    expect(await probeRights(oldHolder.client, folderId)).to.deep.equal({
      read: true,
      write: true,
    });
    expect(await probeRights(newHolder.client, folderId)).to.deep.equal({
      read: false,
      write: false,
    });
    RegisterAssetBinding({
      id,
      folderName: "Runtime B",
      acl: [
        {
          subject: { kind: "permission", id: "runtime.new" },
          rights: ["read"],
        },
      ],
    });
    expect(await boundFolderId(owner, id)).to.equal(folderId);
    expect(await probeRights(oldHolder.client, folderId)).to.deep.equal({
      read: false,
      write: false,
    });
    expect(await probeRights(newHolder.client, folderId)).to.deep.equal({
      read: true,
      write: false,
    });
    const tree = await owner.get("/api/media/tree");
    const bound = readBody(tree, folderTreeBody).folders.filter(
      (folder) => folder.binding === id,
    );
    expect(bound.map((folder) => folder.name)).to.deep.equal(["Runtime A"]);
    const file = await uploadTextAsset(owner, folderId, "kept.txt");
    UnregisterAssetBinding(id);
    const after = await owner.get("/api/media/tree");
    expect(
      readBody(after, folderTreeBody).folders.some(
        (folder) => folder.id === folderId,
      ),
    ).to.equal(true);
    expect((await owner.get(`/api/media/assets/${file.id}`)).status).to.equal(
      HTTP_OK,
    );
  });

  it("declares the field's picker and one folder accepting its types, however often the field is built", async () => {
    const build = () =>
      new AssetType({
        multiple: true,
        max: 3,
        mimetypes: ["image/png"],
        binding: { id: FIELD_BINDING_ID, folderName: "Field covers", acl: [] },
      });
    build();
    const field = serializeType(build());
    expect(JSON.stringify(field)).to.not.contain("acl");
    expect(JSON.parse(JSON.stringify(field)).inputComponent).to.deep.include({
      componentName: "dms-media-asset-picker",
      options: {
        multiple: true,
        max: 3,
        mimetypes: ["image/png"],
        bindingId: FIELD_BINDING_ID,
      },
    });
    const tree = await owner.get("/api/media/tree");
    const bound = readBody(tree, folderTreeBody).folders.filter(
      (folder) => folder.binding === FIELD_BINDING_ID,
    );
    expect(bound).to.have.length(1);
    expect(bound[0]?.accepts).to.deep.equal(["image/png"]);
  });
});

describe("[integration] media bindings — the page's rights on a field's folder", () => {
  let owner: AxiosInstance;

  before(async function () {
    this.timeout(60_000);
    registerProbeBindings();
    owner = authorizedClient((await ensureOwnerSession()).accessToken);
  });

  it("gives a member the page's rights on the field's folder and its subfolders, and no folder right through memberAccess alone", async () => {
    const projects = await boundFolderId(owner, SUBFOLDERS_BINDING_ID);
    const created = await owner.post("/api/media/folders", {
      name: "Projet B",
      parentId: projects,
    });
    const sub = readBody(created, createdBody).id;
    const pageId = GetPermissionId(SubfolderProbePage);
    const openId = GetPermissionId(OpenProbePage);
    assert.isDefined(pageId, "subfolder probe page permission");
    assert.isDefined(openId, "open probe page permission");
    RegisterAssetBinding({
      id: "articles.open",
      permissionsFromPage: OpenProbePage,
    });
    const open = await boundFolderId(owner, "articles.open");
    const editor = await registerMember("PageEditor", [
      await createRole("page-editor", [pageId]),
    ]);
    const plain = await registerMember("PagePlain", [
      await createRole("page-plain", ["unrelated.page"]),
    ]);
    const granted = await registerMember("PageGranted", [
      await createRole("page-granted", [openId]),
    ]);
    expect(await probeRights(editor.client, sub)).to.deep.equal({
      read: true,
      write: true,
    });
    expect(await probeRights(plain.client, projects)).to.deep.equal({
      read: false,
      write: false,
    });
    expect(await probeRights(plain.client, open)).to.deep.equal({
      read: false,
      write: false,
    });
    expect(await probeRights(granted.client, open)).to.deep.equal({
      read: true,
      write: true,
    });
  });
});
