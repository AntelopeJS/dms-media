import { GetModel } from "@antelopejs/interface-database-decorators";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import {
  GetPermissionId,
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import {
  RegisterAssetBinding,
  UnregisterAssetBinding,
} from "@antelopejs/interface-dms-media";
import type { AxiosInstance } from "axios";
import { assert, expect } from "chai";
import { z } from "zod";
import { MediaAssetModel, MediaFolderModel } from "../../db";
import { createdBody, readBody } from "../helpers/bodies";
import { fetchFolderNodes } from "../helpers/folders";
import { authorizedClient } from "../helpers/http";
import {
  memberHolding,
  probeRights,
  uploadPng,
} from "../helpers/member-rights";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
const NO_RIGHTS = { read: false, write: false };
const READ_ONLY = { read: true, write: false };
const READ_AND_WRITE = { read: true, write: true };
const PREFIX = "journeys.bindings";

const boundFolderBody = z.object({ folder: z.object({ id: z.string() }) });

@RegisterPage()
class FieldsPage extends PageController("journeys-bindings-fields", {
  displayName: "Journeys fields",
  icon: "i-ph-images",
  category: pagesCategory,
}) {
  static content = CustomComponent("dms-media-journeys-fields");
}

@RegisterPage()
class OpenPage extends PageController("journeys-bindings-open", {
  displayName: "Journeys open",
  icon: "i-ph-images",
  category: pagesCategory,
  memberAccess: true,
}) {
  static content = CustomComponent("dms-media-journeys-open");
}

const registered = new Set<string>();

function register(config: Parameters<typeof RegisterAssetBinding>[0]): string {
  registered.add(config.id);
  RegisterAssetBinding(config);
  return config.id;
}

/** Removes what this file linked, so later suites meet the library they expect. */
async function removeRegisteredFolders(): Promise<void> {
  for (const id of registered) UnregisterAssetBinding(id);
  const folders = GetModel(MediaFolderModel, DEFAULT_TENANT_ID);
  const assets = GetModel(MediaAssetModel, DEFAULT_TENANT_ID);
  const linked = await folders.getBy("binding", ...registered);
  const doomed = (await folders.getAll()).filter((folder) =>
    linked.some(
      (entry) => entry._id === folder._id || folder.path.includes(entry._id),
    ),
  );
  const files = await assets.getBy(
    "folderId",
    ...doomed.map((folder) => folder._id),
  );
  await Promise.all(files.map((file) => assets.delete(file._id)));
  await Promise.all(doomed.map((folder) => folders.delete(folder._id)));
}

let owner: AxiosInstance;

async function boundFolderId(bindingId: string): Promise<string> {
  const answer = await owner.get(`/api/media/bindings/${bindingId}/folder`);
  expect(answer.status, bindingId).to.equal(HTTP_OK);
  return readBody(answer, boundFolderBody).folder.id;
}

async function createFolder(name: string, parentId?: string): Promise<string> {
  const created = await owner.post("/api/media/folders", { name, parentId });
  expect(created.status, name).to.equal(HTTP_OK);
  return readBody(created, createdBody).id;
}

function describeProvisionedFolders(): void {
  describe("provisioned and locked folders", () => {
    it("bound-folders-live-under-a-private-content-root: the binding route answers the very folder the tree lists", async () => {
      const id = register({
        id: `${PREFIX}.route`,
        folderName: "Route folder",
      });
      const folderId = await boundFolderId(id);
      const listed = (await fetchFolderNodes(owner)).find(
        (folder) => folder.binding === id,
      );
      expect(listed?.id).to.equal(folderId);
    });

    it("a-linked-folder-is-locked: a linked folder cannot be moved into another folder", async () => {
      const linked = await boundFolderId(
        register({ id: `${PREFIX}.locked`, folderName: "Locked folder" }),
      );
      const elsewhere = await createFolder("Journeys elsewhere");
      const moved = await owner.post(`/api/media/folders/${linked}/move`, {
        parentId: elsewhere,
      });
      expect(moved.status).to.equal(HTTP_FORBIDDEN);
    });
  });
}

function describeAclPrecedence(): void {
  describe("acl precedence", () => {
    it("acl-precedence-follows-the-documented-order: rights follow acl, then the mapping right by right, then the page", async function () {
      this.timeout(30_000);
      const fieldsPermission = GetPermissionId(FieldsPage);
      assert.isDefined(fieldsPermission, "fields page permission");
      const empty = await boundFolderId(
        register({
          id: `${PREFIX}.empty`,
          acl: [],
          permissionMapping: { read: ["journeys.reader"] },
          permissionsFromPage: FieldsPage,
        }),
      );
      const mapped = await boundFolderId(
        register({
          id: `${PREFIX}.mapped`,
          permissionMapping: { read: ["journeys.reader"] },
          permissionsFromPage: FieldsPage,
        }),
      );
      const noWrite = await boundFolderId(
        register({
          id: `${PREFIX}.nowrite`,
          permissionMapping: { write: [] },
          permissionsFromPage: FieldsPage,
        }),
      );
      const writeMap = await boundFolderId(
        register({
          id: `${PREFIX}.write`,
          permissionMapping: { write: ["journeys.writer"] },
        }),
      );
      const noRead = await boundFolderId(
        register({
          id: `${PREFIX}.noread`,
          permissionMapping: { read: [], write: ["journeys.writer"] },
          permissionsFromPage: FieldsPage,
        }),
      );
      const pageUser = await memberHolding("JourneysPageUser", [
        fieldsPermission,
      ]);
      const reader = await memberHolding("JourneysReader", ["journeys.reader"]);
      const writer = await memberHolding("JourneysWriter", ["journeys.writer"]);

      expect(
        await probeRights(reader.client, empty),
        "acl [] replaces the read mapping",
      ).to.deep.equal(NO_RIGHTS);
      expect(
        await probeRights(pageUser.client, empty),
        "acl [] replaces the page",
      ).to.deep.equal(NO_RIGHTS);
      expect(
        await probeRights(reader.client, mapped),
        "a read mapping grants read",
      ).to.deep.equal(READ_ONLY);
      expect(
        await probeRights(pageUser.client, mapped),
        "write falls back to the page, and write includes read",
      ).to.deep.equal(READ_AND_WRITE);
      expect(
        await probeRights(pageUser.client, noWrite),
        "write [] turns the write fallback off; read falls back to the page",
      ).to.deep.equal(READ_ONLY);
      expect(
        await probeRights(writer.client, writeMap),
        "a write mapping grants write, which includes read",
      ).to.deep.equal(READ_AND_WRITE);
      expect(
        await probeRights(pageUser.client, writeMap),
        "no page, no fallback",
      ).to.deep.equal(NO_RIGHTS);
      expect(
        await probeRights(pageUser.client, noRead),
        "read [] turns the read fallback off, and write is mapped away too",
      ).to.deep.equal(NO_RIGHTS);
      expect(
        await probeRights(writer.client, noRead),
        "read [] leaves the write mapping, which includes read",
      ).to.deep.equal(READ_AND_WRITE);
    });
  });
}

function describePageRights(): void {
  describe("a field folder takes its page's rights", () => {
    it("a-field-folder-takes-its-page-rights: the page's holder sees, lists and uploads into the field's folders, memberAccess alone opens nothing", async function () {
      this.timeout(30_000);
      const fieldsPermission = GetPermissionId(FieldsPage);
      const openPermission = GetPermissionId(OpenPage);
      assert.isDefined(fieldsPermission, "fields page permission");
      assert.isDefined(openPermission, "open page permission");
      const cover = await boundFolderId(
        register({
          id: `${PREFIX}.cover`,
          folderName: "Journeys covers",
          permissionsFromPage: FieldsPage,
        }),
      );
      const projects = await boundFolderId(
        register({
          id: `${PREFIX}.projects`,
          folderName: "Journeys projects",
          subfolders: true,
          permissionsFromPage: FieldsPage,
        }),
      );
      const open = await boundFolderId(
        register({ id: `${PREFIX}.open`, permissionsFromPage: OpenPage }),
      );
      const sub = await createFolder("Projet B", projects);
      const editor = await memberHolding("JourneysEditor", [fieldsPermission]);
      const plain = await memberHolding("JourneysPlain", ["unrelated.page"]);
      const granted = await memberHolding("JourneysGranted", [openPermission]);

      const editorSees = (await fetchFolderNodes(editor.client)).map(
        (folder) => folder.id,
      );
      expect(editorSees, "the editor sees the field's folder").to.include(
        cover,
      );
      expect(editorSees, "and its subfolder").to.include(sub);
      const uploaded = await uploadPng(editor.client, cover, "editor.png", {
        width: 4,
        height: 4,
      });
      expect(uploaded.id, "the editor uploads there").to.be.a("string");
      expect(
        await probeRights(editor.client, sub),
        "the subfolder inherits the linked folder's ACL",
      ).to.deep.equal(READ_AND_WRITE);
      const plainSees = (await fetchFolderNodes(plain.client)).map(
        (folder) => folder.id,
      );
      for (const hidden of [cover, projects, open]) {
        expect(
          plainSees,
          "a member without the page sees none of it",
        ).not.to.include(hidden);
      }
      expect(
        await probeRights(plain.client, open),
        "memberAccess grants no folder right",
      ).to.deep.equal(NO_RIGHTS);
      expect(
        await probeRights(granted.client, open),
        "an explicit grant of the same page does",
      ).to.deep.equal(READ_AND_WRITE);
    });
  });
}

describe("[integration] media bindings journeys — what a linked folder is and who reaches it", () => {
  before(async function () {
    this.timeout(60_000);
    owner = authorizedClient((await ensureOwnerSession()).accessToken);
  });

  after(async function () {
    this.timeout(30_000);
    await removeRegisteredFolders();
  });

  describeProvisionedFolders();
  describeAclPrecedence();
  describePageRights();
});
