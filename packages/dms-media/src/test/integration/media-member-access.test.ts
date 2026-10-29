import {
  GetPermissionId,
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import {
  GetPermissions,
  type PermissionTree,
} from "@antelopejs/interface-dms/permissions";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { RegisterAssetBinding } from "@antelopejs/interface-dms-media";
import { MEDIA_PAGE_PERMISSION } from "../../pages/files";
import { type UploadedAsset, uploadTextAsset } from "../helpers/assets";
import { readFolderAcl } from "../helpers/folders";
import { authorizedClient } from "../helpers/http";
import {
  createRole,
  type MemberSession,
  registerMember,
} from "../helpers/members";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const SETUP_TIMEOUT_MS = 120_000;

const BINDING_ID = "member-access.gallery";
const LINKED_FOLDER_NAME = "Member access gallery";
const SHELF_FOLDER_NAME = "Member access shelf";
const CONTENT_ROOT_NAME = "Content";

@RegisterPage()
class MemberAccessProbePage extends PageController("member-access-probe", {
  displayName: "Member access probe",
  description: "Probe page whose members reach a linked folder",
  icon: "i-ph-images",
  category: pagesCategory,
}) {
  static content = CustomComponent("dms-media-member-access-probe");
}

interface FolderRights {
  read: boolean;
  write: boolean;
  manage: boolean;
}

interface TreeFolder {
  id: string;
  name: string;
  shell: boolean;
  rights: FolderRights;
}

interface RootRights {
  write: boolean;
  manage: boolean;
}

interface TreeResponse {
  folders: TreeFolder[];
  root: RootRights;
  isOwner: boolean;
}

interface MemberAccessWorld {
  owner: AxiosInstance;
  pageMember: MemberSession;
  modulePageMember: MemberSession;
  linkedFolderId: string;
  shelfFolderId: string;
  ownerAsset: UploadedAsset;
}

async function fetchTree(client: AxiosInstance): Promise<TreeResponse> {
  const response = await client.get("/api/media/tree");
  expect(response.status, "tree").to.equal(HTTP_OK);
  return response.data;
}

function findFolder(tree: TreeResponse, name: string): TreeFolder | undefined {
  return tree.folders.find((folder) => folder.name === name);
}

function collectPermissionIds(tree: Record<string, PermissionTree>): string[] {
  return Object.values(tree).flatMap((node) => [
    ...(node.data ? [node.data.id] : []),
    ...collectPermissionIds(node.children),
  ]);
}

function presignInto(client: AxiosInstance, folderId: string) {
  return client.post("/api/media/upload/presign", {
    folderId,
    filename: "probe.txt",
    size: 1,
    mimetype: "text/plain",
  });
}

async function buildWorld(): Promise<MemberAccessWorld> {
  const session = await ensureOwnerSession();
  const owner = authorizedClient(session.accessToken);
  const pagePermission = GetPermissionId(MemberAccessProbePage) as string;
  const [pageRole, modulePageRole] = await Promise.all([
    createRole("member-access-page", [pagePermission]),
    createRole("member-access-module-page", [MEDIA_PAGE_PERMISSION]),
  ]);
  const shelf = await owner.post("/api/media/folders", {
    name: SHELF_FOLDER_NAME,
  });
  expect(shelf.status, "create shelf").to.equal(HTTP_OK);
  const linked = findFolder(await fetchTree(owner), LINKED_FOLDER_NAME);
  expect(linked, "provisioned linked folder").to.not.equal(undefined);
  const linkedFolderId = (linked as TreeFolder).id;
  return {
    owner,
    pageMember: await registerMember("PageMember", [pageRole]),
    modulePageMember: await registerMember("ModulePageMember", [
      modulePageRole,
    ]),
    linkedFolderId,
    shelfFolderId: shelf.data.id,
    ownerAsset: await uploadTextAsset(owner, linkedFolderId, "owner-file.txt"),
  };
}

describe("[integration] media member access — roles, root ACL and linked folders", () => {
  let world: MemberAccessWorld;

  before(async function () {
    this.timeout(SETUP_TIMEOUT_MS);
    RegisterAssetBinding({
      id: BINDING_ID,
      folderName: LINKED_FOLDER_NAME,
      permissionsFromPage: MemberAccessProbePage,
    });
    world = await buildWorld();
  });

  after(async () => {
    await world.owner.delete(`/api/media/folders/${world.shelfFolderId}`);
  });

  describe("roles editor", () => {
    it("offers no media permission and no hidden dependency on the All files page", async () => {
      const permissionIds = collectPermissionIds(await GetPermissions());
      expect(permissionIds).to.not.include(MEDIA_PAGE_PERMISSION);
    });
  });

  describe("library root", () => {
    it("opens nothing to a role holding the All files page", async () => {
      const tree = await fetchTree(world.modulePageMember.client);
      expect(tree.folders).to.deep.equal([]);
      expect(tree.root).to.include({ write: false, manage: false });
      expect(tree.isOwner).to.equal(false);
      const listing = await world.modulePageMember.client.get(
        `/api/media/folders/${world.shelfFolderId}/assets`,
      );
      expect(listing.status).to.equal(HTTP_NOT_FOUND);
      const presign = await presignInto(
        world.modulePageMember.client,
        world.shelfFolderId,
      );
      expect(presign.status).to.equal(HTTP_NOT_FOUND);
      const created = await world.modulePageMember.client.post(
        "/api/media/folders",
        { name: "Member attempt" },
      );
      expect(created.status).to.equal(HTTP_FORBIDDEN);
    });
  });

  describe("linked folders of a project page", () => {
    it("shows a page member the linked folder only", async () => {
      const tree = await fetchTree(world.pageMember.client);
      const linked = findFolder(tree, LINKED_FOLDER_NAME);
      expect(linked?.rights).to.deep.equal({
        read: true,
        write: true,
        manage: false,
      });
      expect(findFolder(tree, CONTENT_ROOT_NAME)?.shell).to.equal(true);
      expect(findFolder(tree, SHELF_FOLDER_NAME)).to.equal(undefined);
      expect(tree.root).to.include({ write: false, manage: false });
    });

    it("lets a page member upload, describe and remove files of the linked folder", async () => {
      const client = world.pageMember.client;
      const uploaded = await uploadTextAsset(
        client,
        world.linkedFolderId,
        "member-file.txt",
      );
      const described = await client.post(
        `/api/media/assets/${world.ownerAsset.id}/update`,
        { alt: "Described by a page member" },
      );
      expect(described.status).to.equal(HTTP_OK);
      const removed = await client.delete(`/api/media/assets/${uploaded.id}`);
      expect(removed.status).to.equal(HTTP_OK);
    });

    it("keeps visibility changes with the owner", async () => {
      const path = `/api/media/assets/${world.ownerAsset.id}/visibility`;
      const denied = await world.pageMember.client.post(path, {
        visibility: "public",
      });
      expect(denied.status).to.equal(HTTP_FORBIDDEN);
      const allowed = await world.owner.post(path, { visibility: "inherit" });
      expect(allowed.status).to.equal(HTTP_OK);
    });

    it("stores no manage entry on the linked folder", async () => {
      const entries = (await readFolderAcl(world.linkedFolderId)) ?? [];
      const managed = entries.filter((entry) =>
        entry.rights.includes("manage"),
      );
      expect(managed).to.deep.equal([]);
    });

    it("keeps every right for the owner", async () => {
      const tree = await fetchTree(world.owner);
      expect(tree.root).to.include({ write: true, manage: true });
      expect(tree.isOwner).to.equal(true);
      expect(findFolder(tree, LINKED_FOLDER_NAME)?.rights.manage).to.equal(
        true,
      );
      expect(findFolder(tree, SHELF_FOLDER_NAME)?.rights.manage).to.equal(true);
    });
  });
});
