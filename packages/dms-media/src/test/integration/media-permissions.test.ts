import type { AxiosInstance } from "axios";
import { assert, expect } from "chai";
import { RegisterAssetBinding } from "@antelopejs/interface-dms-media";
import {
  configureMediaModule,
  type DmsMediaConfig,
  getMediaConfig,
} from "../../config";
import { GetPermissionId } from "@antelopejs/interface-dms/page";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { MEDIA_PAGE_PERMISSION } from "../../pages/files";
import { MediaUploadsPage } from "../../pages/uploads";
import { uploadAvailability } from "../../pages/upload-availability";
import { MEDIA_ROUTES } from "../../library/links";
import type { AclEntry } from "../../types";
import {
  rawGet,
  type UploadedAsset,
  uploadPixelPng,
  uploadTextAsset,
} from "../helpers/assets";
import { readFolderAcl, writeFolderAcl } from "../helpers/folders";
import { authorizedClient } from "../helpers/http";
import { readPageAccess } from "../helpers/pages";
import {
  createRole,
  type MemberSession,
  registerMember,
  setRolePermissions,
} from "../helpers/members";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_FOUND = 302;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const SETUP_TIMEOUT_MS = 120_000;

const LIBRARY_VIEW_PERMISSION = "warehouse.library.view";
const LIBRARY_UPLOAD_PERMISSION = "warehouse.library.upload";
const LIBRARY_MANAGE_PERMISSION = "warehouse.library.manage";
const WAREHOUSE_EDIT_PERMISSION = "warehouse.table.edit";
const WAREHOUSE_VIEW_PERMISSION = "warehouse.page";
const STOCK_BINDING_ID = "warehouse.stock";
const STOCK_FOLDER_NAME = "Warehouse stock";
const CONTENT_ROOT_NAME = "Content";
const ROTATE_QUARTER_TURN = 90;

interface TreeFolderNode {
  id: string;
  name: string;
  parentId: string | null;
  shell: boolean;
  bound: boolean;
  visibility: string;
  rights: { read: boolean; write: boolean; manage: boolean };
}

interface TreeRootRights {
  write: boolean;
  manage: boolean;
}

interface TreeResponse {
  folders: TreeFolderNode[];
  root: TreeRootRights;
}

interface WorldRoles {
  pageHolder: string;
  viewer: string;
  uploader: string;
  folderManager: string;
  clerk: string;
  secretTeam: string;
  latecomer: string;
}

interface WorldSessions {
  pageHolder: MemberSession;
  viewer: MemberSession;
  uploader: MemberSession;
  folderManager: MemberSession;
  clerk: MemberSession;
  secretMember: MemberSession;
  hybrid: MemberSession;
  latecomer: MemberSession;
  outsider: MemberSession;
}

interface WorldFolders {
  library: string;
  restricted: string;
  deep: string;
  vault: string;
  pocket: string;
  publicZone: string;
  readOnlyCorner: string;
  depot: string;
  curtain: string;
  stock: string;
  contentRoot: string;
}

interface WorldAssets {
  notes: UploadedAsset;
  secretText: UploadedAsset;
  secretPng: UploadedAsset;
  libraryPng: UploadedAsset;
}

async function fetchTree(client: AxiosInstance): Promise<TreeResponse> {
  const response = await client.get("/api/media/tree");
  expect(response.status, "tree").to.equal(HTTP_OK);
  return response.data;
}

function findByName(
  tree: TreeResponse,
  name: string,
): TreeFolderNode | undefined {
  return tree.folders.find((folder) => folder.name === name);
}

function findById(tree: TreeResponse, id: string): TreeFolderNode | undefined {
  return tree.folders.find((folder) => folder.id === id);
}

/** The folder `id` of the tree, failing the test when the tree does not show it. */
function requireById(tree: TreeResponse, id: string): TreeFolderNode {
  const folder = findById(tree, id);
  assert.isDefined(folder, `folder ${id}`);
  return folder;
}

async function createFolder(
  owner: AxiosInstance,
  name: string,
  parentId?: string,
): Promise<string> {
  const response = await owner.post("/api/media/folders", { name, parentId });
  expect(response.status, `create folder ${name}`).to.equal(HTTP_OK);
  return response.data.id;
}

function roleEntry(roleId: string, rights: AclEntry["rights"]): AclEntry {
  return { subject: { kind: "role", id: roleId }, rights };
}

function permissionEntry(id: string, rights: AclEntry["rights"]): AclEntry {
  return { subject: { kind: "permission", id }, rights };
}

function snapshotMediaConfig(): DmsMediaConfig {
  const config = getMediaConfig();
  return {
    rootAcl: config.rootAcl,
    storage: config.storage,
    presets: [...config.presets.values()],
    storageQuotaBytes: config.storageQuotaBytes,
  };
}

function grantLibraryAtRoot(config: DmsMediaConfig): void {
  configureMediaModule({
    ...config,
    rootAcl: [
      ...(config.rootAcl ?? []),
      permissionEntry(LIBRARY_VIEW_PERMISSION, ["read"]),
      permissionEntry(LIBRARY_UPLOAD_PERMISSION, ["write"]),
      permissionEntry(LIBRARY_MANAGE_PERMISSION, ["manage"]),
    ],
  });
}

async function createWorldRoles(): Promise<WorldRoles> {
  const [
    pageHolder,
    viewer,
    uploader,
    folderManager,
    clerk,
    secretTeam,
    latecomer,
  ] = await Promise.all([
    createRole("media-page-holder", [MEDIA_PAGE_PERMISSION]),
    createRole("media-viewer", [LIBRARY_VIEW_PERMISSION]),
    createRole("media-uploader", [
      LIBRARY_VIEW_PERMISSION,
      LIBRARY_UPLOAD_PERMISSION,
    ]),
    createRole("media-folder-manager", [
      LIBRARY_VIEW_PERMISSION,
      LIBRARY_MANAGE_PERMISSION,
    ]),
    createRole("warehouse-clerk", [WAREHOUSE_EDIT_PERMISSION]),
    createRole("secret-team", []),
    createRole("latecomer", []),
  ]);
  return {
    pageHolder,
    viewer,
    uploader,
    folderManager,
    clerk,
    secretTeam,
    latecomer,
  };
}

async function registerWorldMembers(roles: WorldRoles): Promise<WorldSessions> {
  return {
    pageHolder: await registerMember("PageHolder", [roles.pageHolder]),
    viewer: await registerMember("Viewer", [roles.viewer]),
    uploader: await registerMember("Uploader", [roles.uploader]),
    folderManager: await registerMember("FolderManager", [roles.folderManager]),
    clerk: await registerMember("Clerk", [roles.clerk]),
    secretMember: await registerMember("SecretMember", [roles.secretTeam]),
    hybrid: await registerMember("Hybrid", [roles.viewer, roles.secretTeam]),
    latecomer: await registerMember("Latecomer", [roles.latecomer]),
    outsider: await registerMember("Outsider", []),
  };
}

async function buildWorldFolders(
  owner: AxiosInstance,
  secretTeamRoleId: string,
): Promise<WorldFolders> {
  const library = await createFolder(owner, "Library");
  const restricted = await createFolder(owner, "Restricted");
  const deep = await createFolder(owner, "Deep", restricted);
  const vault = await createFolder(owner, "Vault");
  const pocket = await createFolder(owner, "Pocket", vault);
  const publicZone = await createFolder(owner, "PublicZone");
  const readOnlyCorner = await createFolder(owner, "ReadOnlyCorner");
  const depot = await createFolder(owner, "Depot");
  const curtain = await createFolder(owner, "Curtain");
  await writeFolderAcl(restricted, [roleEntry(secretTeamRoleId, ["write"])]);
  await writeFolderAcl(vault, []);
  await writeFolderAcl(pocket, [roleEntry(secretTeamRoleId, ["read"])]);
  await writeFolderAcl(readOnlyCorner, [
    permissionEntry(LIBRARY_VIEW_PERMISSION, ["read"]),
  ]);
  const flip = await owner.post(`/api/media/folders/${publicZone}/visibility`, {
    visibility: "public",
  });
  expect(flip.status, "flip PublicZone public").to.equal(HTTP_OK);
  const tree = await fetchTree(owner);
  const stock = findByName(tree, STOCK_FOLDER_NAME);
  const contentRoot = findByName(tree, CONTENT_ROOT_NAME);
  assert.isDefined(stock, "provisioned stock folder");
  assert.isDefined(contentRoot, "provisioned content root");
  return {
    library,
    restricted,
    deep,
    vault,
    pocket,
    publicZone,
    readOnlyCorner,
    depot,
    curtain,
    stock: stock.id,
    contentRoot: contentRoot.id,
  };
}

async function seedWorldAssets(
  owner: AxiosInstance,
  folders: WorldFolders,
): Promise<WorldAssets> {
  return {
    notes: await uploadTextAsset(owner, folders.library, "notes.txt"),
    secretText: await uploadTextAsset(owner, folders.restricted, "secret.txt"),
    secretPng: await uploadPixelPng(owner, folders.restricted),
    libraryPng: await uploadPixelPng(owner, folders.library),
  };
}

describe("[integration] media permissions — multi-actor ACL enforcement", () => {
  let owner: AxiosInstance;
  let roles: WorldRoles;
  let sessions: WorldSessions;
  let folders: WorldFolders;
  let assets: WorldAssets;
  let stockAssetId: string;
  let previousConfig: DmsMediaConfig;

  before(async function () {
    this.timeout(SETUP_TIMEOUT_MS);
    previousConfig = snapshotMediaConfig();
    grantLibraryAtRoot(previousConfig);
    RegisterAssetBinding({
      id: STOCK_BINDING_ID,
      folderName: STOCK_FOLDER_NAME,
      permissionMapping: { write: [WAREHOUSE_EDIT_PERMISSION] },
    });
    const session = await ensureOwnerSession();
    owner = authorizedClient(session.accessToken);
    roles = await createWorldRoles();
    sessions = await registerWorldMembers(roles);
    folders = await buildWorldFolders(owner, roles.secretTeam);
    assets = await seedWorldAssets(owner, folders);
  });

  after(async () => {
    const roots = [
      folders.library,
      folders.restricted,
      folders.vault,
      folders.publicZone,
      folders.readOnlyCorner,
      folders.depot,
      folders.curtain,
    ];
    for (const folderId of roots) {
      await owner.delete(`/api/media/folders/${folderId}`);
    }
    configureMediaModule(previousConfig);
  });

  describe("tree visibility", () => {
    it("shows nothing to a member with no roles", async () => {
      const tree = await fetchTree(sessions.outsider.client);
      expect(tree.folders).to.deep.equal([]);
      expect(tree.root).to.include({ write: false, manage: false });
    });

    it("grants nothing through the All files page permission", async () => {
      const tree = await fetchTree(sessions.pageHolder.client);
      expect(tree.folders).to.deep.equal([]);
      expect(tree.root).to.include({ write: false, manage: false });
    });

    it("shows only root-inherited folders to a holder of a root read grant", async () => {
      const tree = await fetchTree(sessions.viewer.client);
      const library = findById(tree, folders.library);
      assert.isDefined(library, "library");
      expect(library.rights).to.deep.equal({
        read: true,
        write: false,
        manage: false,
      });
      expect(library.shell).to.equal(false);
      for (const hiddenId of [
        folders.restricted,
        folders.deep,
        folders.vault,
        folders.pocket,
        folders.stock,
        folders.contentRoot,
      ]) {
        expect(findById(tree, hiddenId), `folder ${hiddenId}`).to.equal(
          undefined,
        );
      }
    });

    it("grants folder access through a role subject alone", async () => {
      const tree = await fetchTree(sessions.secretMember.client);
      expect(requireById(tree, folders.restricted).rights).to.deep.equal({
        read: true,
        write: true,
        manage: false,
      });
      expect(requireById(tree, folders.deep).rights.write).to.equal(true);
      const pocket = requireById(tree, folders.pocket);
      expect(pocket.rights).to.deep.equal({
        read: true,
        write: false,
        manage: false,
      });
      const vault = requireById(tree, folders.vault);
      expect(vault.shell, "vault is a traverse-only shell").to.equal(true);
      expect(vault.rights.read).to.equal(false);
      expect(findById(tree, folders.library)).to.equal(undefined);
      expect(tree.root).to.include({ write: false, manage: false });
    });

    it("auto-grants the linked folder to consumer permission holders", async () => {
      const tree = await fetchTree(sessions.clerk.client);
      const stock = findById(tree, folders.stock);
      assert.isDefined(stock, "linked stock folder");
      expect(stock.rights).to.deep.equal({
        read: true,
        write: true,
        manage: false,
      });
      const contentRoot = requireById(tree, folders.contentRoot);
      expect(contentRoot.shell, "content root is a shell").to.equal(true);
      expect(findById(tree, folders.library)).to.equal(undefined);
    });

    it("unions permission and role subjects across multiple roles", async () => {
      const tree = await fetchTree(sessions.hybrid.client);
      const library = findById(tree, folders.library);
      assert.isDefined(library, "library via the root read grant");
      expect(library.rights.read).to.equal(true);
      const restricted = findById(tree, folders.restricted);
      assert.isDefined(restricted, "restricted via secret-team");
      expect(restricted.rights.write).to.equal(true);
    });

    it("expands implied rights for uploader and folder manager", async () => {
      const uploaderTree = await fetchTree(sessions.uploader.client);
      expect(uploaderTree.root).to.include({ write: true, manage: false });
      expect(requireById(uploaderTree, folders.library).rights).to.deep.equal({
        read: true,
        write: true,
        manage: false,
      });

      const managerTree = await fetchTree(sessions.folderManager.client);
      expect(managerTree.root).to.include({ write: true, manage: true });
      expect(requireById(managerTree, folders.library).rights).to.deep.equal({
        read: true,
        write: true,
        manage: true,
      });
      expect(
        findById(managerTree, folders.stock),
        "linked folders stay with the owner and their consumers",
      ).to.equal(undefined);
    });
  });

  describe("listing, search and read paths", () => {
    it("hides unreadable folder listings behind 404", async () => {
      const listing = await sessions.viewer.client.get(
        `/api/media/folders/${folders.restricted}/assets`,
      );
      expect(listing.status).to.equal(HTTP_NOT_FOUND);
      const vaultListing = await sessions.viewer.client.get(
        `/api/media/folders/${folders.vault}/assets`,
      );
      expect(vaultListing.status).to.equal(HTTP_NOT_FOUND);
    });

    it("refuses to list a traverse-only shell with 403", async () => {
      const listing = await sessions.secretMember.client.get(
        `/api/media/folders/${folders.vault}/assets`,
      );
      expect(listing.status).to.equal(HTTP_FORBIDDEN);
    });

    it("lists readable folders and their assets", async () => {
      const listing = await sessions.secretMember.client.get(
        `/api/media/folders/${folders.restricted}/assets`,
      );
      expect(listing.status).to.equal(HTTP_OK);
      const names = listing.data.assets.map(
        (asset: UploadedAsset) => asset.name,
      );
      expect(names).to.include("secret.txt");
    });

    it("hides unreadable assets behind 404 on detail and read-url", async () => {
      const detail = await sessions.viewer.client.get(
        `/api/media/assets/${assets.secretText.id}`,
      );
      expect(detail.status).to.equal(HTTP_NOT_FOUND);
      const readUrl = await sessions.viewer.client.get(
        `/api/media/assets/${assets.secretText.id}/read-url`,
      );
      expect(readUrl.status).to.equal(HTTP_NOT_FOUND);
      const allowed = await sessions.secretMember.client.get(
        `/api/media/assets/${assets.secretText.id}`,
      );
      expect(allowed.status).to.equal(HTTP_OK);
    });

    it("scopes search results to readable folders", async () => {
      const blind = await sessions.viewer.client.get(
        "/api/media/assets/search?q=secret",
      );
      expect(blind.status).to.equal(HTTP_OK);
      expect(blind.data.assets).to.deep.equal([]);
      const sighted = await sessions.secretMember.client.get(
        "/api/media/assets/search?q=secret",
      );
      expect(sighted.status).to.equal(HTTP_OK);
      const names = sighted.data.assets.map(
        (asset: UploadedAsset) => asset.name,
      );
      expect(names).to.include("secret.txt");
    });

    it("guards folder-scoped search like a listing", async () => {
      const hidden = await sessions.viewer.client.get(
        `/api/media/assets/search?folderId=${folders.restricted}`,
      );
      expect(hidden.status).to.equal(HTTP_NOT_FOUND);
      const shell = await sessions.secretMember.client.get(
        `/api/media/assets/search?folderId=${folders.vault}`,
      );
      expect(shell.status).to.equal(HTTP_FORBIDDEN);
      const readable = await sessions.secretMember.client.get(
        `/api/media/assets/search?folderId=${folders.pocket}`,
      );
      expect(readable.status).to.equal(HTTP_OK);
    });

    it("filters unreadable assets out of preview batches", async () => {
      const previews = await sessions.viewer.client.post(
        "/api/media/previews",
        { ids: [assets.libraryPng.id, assets.secretPng.id] },
      );
      expect(previews.status).to.equal(HTTP_OK);
      expect(previews.data.previews[assets.libraryPng.id]).to.be.a("string");
      expect(previews.data.previews[assets.secretPng.id]).to.equal(undefined);
    });
  });

  describe("write rights", () => {
    it("refuses presign without the write right", async () => {
      const denied = await sessions.viewer.client.post(
        "/api/media/upload/presign",
        {
          folderId: folders.library,
          filename: "nope.txt",
          size: 1,
          mimetype: "text/plain",
        },
      );
      expect(denied.status).to.equal(HTTP_FORBIDDEN);
    });

    it("hides invisible upload targets behind 404", async () => {
      const denied = await sessions.clerk.client.post(
        "/api/media/upload/presign",
        {
          folderId: folders.library,
          filename: "nope.txt",
          size: 1,
          mimetype: "text/plain",
        },
      );
      expect(denied.status).to.equal(HTTP_NOT_FOUND);
    });

    it("lets an uploader run the full upload/delete cycle", async () => {
      const uploaded = await uploadTextAsset(
        sessions.uploader.client,
        folders.library,
        "uploader-cycle.txt",
      );
      const deleted = await sessions.uploader.client.delete(
        `/api/media/assets/${uploaded.id}`,
      );
      expect(deleted.status).to.equal(HTTP_OK);
    });

    it("applies folder ACL writes for role members and linked consumers", async () => {
      await uploadTextAsset(
        sessions.secretMember.client,
        folders.restricted,
        "secret-upload.txt",
      );
      const readOnly = await sessions.secretMember.client.post(
        "/api/media/upload/presign",
        {
          folderId: folders.pocket,
          filename: "nope.txt",
          size: 1,
          mimetype: "text/plain",
        },
      );
      expect(readOnly.status).to.equal(HTTP_FORBIDDEN);
      const stockAsset = await uploadTextAsset(
        sessions.clerk.client,
        folders.stock,
        "stock-item.txt",
      );
      stockAssetId = stockAsset.id;
    });

    it("requires write to update or delete an asset", async () => {
      const denied = await sessions.viewer.client.post(
        `/api/media/assets/${assets.notes.id}/update`,
        { alt: "sneaky" },
      );
      expect(denied.status).to.equal(HTTP_FORBIDDEN);
      const deniedDelete = await sessions.viewer.client.delete(
        `/api/media/assets/${assets.notes.id}`,
      );
      expect(deniedDelete.status).to.equal(HTTP_FORBIDDEN);
      const allowed = await sessions.uploader.client.post(
        `/api/media/assets/${assets.notes.id}/update`,
        { alt: "notes alt" },
      );
      expect(allowed.status).to.equal(HTTP_OK);
    });

    it("checks both source and target folders on asset moves", async () => {
      const invisibleTarget = await sessions.uploader.client.post(
        `/api/media/assets/${assets.notes.id}/move`,
        { folderId: folders.restricted },
      );
      expect(invisibleTarget.status).to.equal(HTTP_NOT_FOUND);
      const readOnlyTarget = await sessions.uploader.client.post(
        `/api/media/assets/${assets.notes.id}/move`,
        { folderId: folders.readOnlyCorner },
      );
      expect(readOnlyTarget.status).to.equal(HTTP_FORBIDDEN);
      const allowed = await sessions.uploader.client.post(
        `/api/media/assets/${assets.notes.id}/move`,
        { folderId: folders.depot },
      );
      expect(allowed.status).to.equal(HTTP_OK);
      const back = await sessions.uploader.client.post(
        `/api/media/assets/${assets.notes.id}/move`,
        { folderId: folders.library },
      );
      expect(back.status).to.equal(HTTP_OK);
    });

    it("blocks moves that would flip effective visibility", async () => {
      const exfiltration = await sessions.uploader.client.post(
        `/api/media/assets/${assets.notes.id}/move`,
        { folderId: folders.publicZone },
      );
      expect(exfiltration.status).to.equal(HTTP_FORBIDDEN);
      const ownerMove = await owner.post(
        `/api/media/assets/${assets.notes.id}/move`,
        { folderId: folders.publicZone },
      );
      expect(ownerMove.status).to.equal(HTTP_OK);
      const ownerMoveBack = await owner.post(
        `/api/media/assets/${assets.notes.id}/move`,
        { folderId: folders.library },
      );
      expect(ownerMoveBack.status).to.equal(HTTP_OK);
    });

    it("allows a move into a public folder when effective visibility is unchanged", async () => {
      const pinned = await uploadTextAsset(
        sessions.uploader.client,
        folders.library,
        "pinned-private.txt",
      );
      const pin = await owner.post(
        `/api/media/assets/${pinned.id}/visibility`,
        { visibility: "private" },
      );
      expect(pin.status).to.equal(HTTP_OK);
      const move = await sessions.uploader.client.post(
        `/api/media/assets/${pinned.id}/move`,
        { folderId: folders.publicZone },
      );
      expect(move.status).to.equal(HTTP_OK);
    });
  });

  describe("transform rights", () => {
    it("requires the write right to transform an image", async () => {
      const denied = await sessions.viewer.client.post(
        `/api/media/assets/${assets.libraryPng.id}/transform`,
        { rotate: ROTATE_QUARTER_TURN },
      );
      expect(denied.status).to.equal(HTTP_FORBIDDEN);
      const allowed = await sessions.uploader.client.post(
        `/api/media/assets/${assets.libraryPng.id}/transform`,
        { rotate: ROTATE_QUARTER_TURN },
      );
      expect(allowed.status).to.equal(HTTP_OK);
      expect(allowed.data.asset.hasOriginal).to.equal(true);
    });

    it("requires the write right to revert an edited image", async () => {
      const denied = await sessions.viewer.client.post(
        `/api/media/assets/${assets.libraryPng.id}/revert`,
      );
      expect(denied.status).to.equal(HTTP_FORBIDDEN);
      const allowed = await sessions.uploader.client.post(
        `/api/media/assets/${assets.libraryPng.id}/revert`,
      );
      expect(allowed.status).to.equal(HTTP_OK);
    });

    it("hides transforms on unreadable assets behind 404", async () => {
      const denied = await sessions.viewer.client.post(
        `/api/media/assets/${assets.secretPng.id}/transform`,
        { rotate: ROTATE_QUARTER_TURN },
      );
      expect(denied.status).to.equal(HTTP_NOT_FOUND);
    });
  });

  describe("folder management and ACL edition", () => {
    it("requires manage at the root to create top-level folders", async () => {
      const denied = await sessions.uploader.client.post("/api/media/folders", {
        name: "Nope",
      });
      expect(denied.status).to.equal(HTTP_FORBIDDEN);
    });

    it("lets a folder manager create, rename, move and delete folders", async () => {
      const created = await sessions.folderManager.client.post(
        "/api/media/folders",
        { name: "Managed" },
      );
      expect(created.status).to.equal(HTTP_OK);
      const managedId = created.data.id;
      const renamed = await sessions.folderManager.client.post(
        `/api/media/folders/${managedId}/rename`,
        { name: "Managed renamed" },
      );
      expect(renamed.status).to.equal(HTTP_OK);
      const moved = await sessions.folderManager.client.post(
        `/api/media/folders/${managedId}/move`,
        { parentId: folders.depot },
      );
      expect(moved.status).to.equal(HTTP_OK);
      const deleted = await sessions.folderManager.client.delete(
        `/api/media/folders/${managedId}`,
      );
      expect(deleted.status).to.equal(HTTP_OK);
    });

    it("refuses cascade deletion when a subfolder lacks the manage right", async () => {
      const estate = await createFolder(owner, "Estate");
      const cellar = await createFolder(owner, "EstateCellar", estate);
      await writeFolderAcl(cellar, [roleEntry(roles.secretTeam, ["manage"])]);
      const denied = await sessions.folderManager.client.delete(
        `/api/media/folders/${estate}`,
      );
      expect(denied.status).to.equal(HTTP_FORBIDDEN);
      const cleanup = await owner.delete(`/api/media/folders/${estate}`);
      expect(cleanup.status).to.equal(HTTP_OK);
    });

    it("checks the target parent's manage right on folder moves", async () => {
      const created = await sessions.folderManager.client.post(
        "/api/media/folders",
        { name: "Nomad" },
      );
      expect(created.status).to.equal(HTTP_OK);
      const nomadId = created.data.id;
      const invisibleTarget = await sessions.folderManager.client.post(
        `/api/media/folders/${nomadId}/move`,
        { parentId: folders.restricted },
      );
      expect(invisibleTarget.status).to.equal(HTTP_NOT_FOUND);
      const unmanagedTarget = await sessions.folderManager.client.post(
        `/api/media/folders/${nomadId}/move`,
        { parentId: folders.readOnlyCorner },
      );
      expect(unmanagedTarget.status).to.equal(HTTP_FORBIDDEN);
      const cleanup = await sessions.folderManager.client.delete(
        `/api/media/folders/${nomadId}`,
      );
      expect(cleanup.status).to.equal(HTTP_OK);
    });

    it("keeps visibility changes owner-only, even for a folder manager", async () => {
      const folderFlip = await sessions.folderManager.client.post(
        `/api/media/folders/${folders.depot}/visibility`,
        { visibility: "public" },
      );
      expect(folderFlip.status).to.equal(HTTP_FORBIDDEN);
      const assetFlip = await sessions.folderManager.client.post(
        `/api/media/assets/${assets.notes.id}/visibility`,
        { visibility: "public" },
      );
      expect(assetFlip.status).to.equal(HTTP_FORBIDDEN);
    });

    it("applies a stored folder ACL on the next request", async () => {
      const before = await fetchTree(sessions.viewer.client);
      expect(findById(before, folders.curtain), "curtain visible").to.not.equal(
        undefined,
      );
      expect(await readFolderAcl(folders.curtain)).to.equal(undefined);
      await writeFolderAcl(folders.curtain, [
        roleEntry(roles.secretTeam, ["manage"]),
      ]);
      const hidden = await fetchTree(sessions.viewer.client);
      expect(findById(hidden, folders.curtain), "curtain hidden").to.equal(
        undefined,
      );
    });

    it("never locks the owner out of a folder", async () => {
      await writeFolderAcl(folders.curtain, []);
      const tree = await fetchTree(owner);
      expect(findById(tree, folders.curtain)?.rights.manage).to.equal(true);
    });

    it("restores inheritance when the ACL is cleared", async () => {
      await writeFolderAcl(folders.curtain, null);
      const tree = await fetchTree(sessions.viewer.client);
      expect(findById(tree, folders.curtain), "curtain back").to.not.equal(
        undefined,
      );
    });

    it("lets the owner flip folder and asset visibility", async () => {
      const folderFlip = await owner.post(
        `/api/media/folders/${folders.curtain}/visibility`,
        { visibility: "public" },
      );
      expect(folderFlip.status).to.equal(HTTP_OK);
      const folderBack = await owner.post(
        `/api/media/folders/${folders.curtain}/visibility`,
        { visibility: "private" },
      );
      expect(folderBack.status).to.equal(HTTP_OK);
      const assetFlip = await owner.post(
        `/api/media/assets/${assets.notes.id}/visibility`,
        { visibility: "private" },
      );
      expect(assetFlip.status).to.equal(HTTP_OK);
      const assetBack = await owner.post(
        `/api/media/assets/${assets.notes.id}/visibility`,
        { visibility: "inherit" },
      );
      expect(assetBack.status).to.equal(HTTP_OK);
    });

    it("keeps linked folders locked even for the owner", async () => {
      const rename = await owner.post(
        `/api/media/folders/${folders.stock}/rename`,
        { name: "Hijacked stock" },
      );
      expect(rename.status).to.equal(HTTP_FORBIDDEN);
    });
  });

  describe("delivery", () => {
    it("enforces folder read rights on the private delivery route", async () => {
      const path = `/media/${assets.secretPng.id}/pixel.png`;
      const denied = await rawGet(path, sessions.viewer.accessToken);
      expect(denied.status).to.equal(HTTP_FORBIDDEN);
      const allowed = await rawGet(path, sessions.secretMember.accessToken);
      expect(allowed.status).to.equal(HTTP_FOUND);
      expect(allowed.cacheControl).to.equal("no-store");
    });

    it("serves linked-folder assets to the consumer permission holder", async () => {
      const path = `/media/${stockAssetId}/stock-item.txt`;
      const allowed = await rawGet(path, sessions.clerk.accessToken);
      expect(allowed.status).to.equal(HTTP_FOUND);
      const denied = await rawGet(path, sessions.viewer.accessToken);
      expect(denied.status).to.equal(HTTP_FORBIDDEN);
    });

    it("applies the same ACL to derivative delivery", async () => {
      const path = `/media/${assets.secretPng.id}/thumb/pixel.png`;
      const denied = await rawGet(path, sessions.viewer.accessToken);
      expect(denied.status).to.equal(HTTP_FORBIDDEN);
      const allowed = await rawGet(path, sessions.secretMember.accessToken);
      expect(allowed.status).to.equal(HTTP_FOUND);
      expect(allowed.cacheControl).to.equal("no-store");
    });
  });

  describe("dynamic role updates", () => {
    it("grants access on the next request when the role gains a permission", async () => {
      const before = await fetchTree(sessions.latecomer.client);
      expect(before.folders).to.deep.equal([]);
      await setRolePermissions(roles.latecomer, [LIBRARY_VIEW_PERMISSION]);
      const after = await fetchTree(sessions.latecomer.client);
      expect(
        findById(after, folders.library),
        "library visible after grant",
      ).to.not.equal(undefined);
    });

    it("revokes access on the next request when the permission is removed", async () => {
      await setRolePermissions(roles.latecomer, []);
      const tree = await fetchTree(sessions.latecomer.client);
      expect(tree.folders).to.deep.equal([]);
    });
  });

  describe("upload header button", () => {
    const uploadsPagePermission = GetPermissionId(MediaUploadsPage) ?? "";

    async function uploadButton(client: AxiosInstance) {
      const layout = await client.get("/dms/pagelayout", {
        params: { slug: MEDIA_ROUTES.uploads },
      });
      expect(layout.status).to.equal(HTTP_OK);
      return layout.data.layout.options.headerActions[0];
    }

    async function latecomerAvailability() {
      const user = await GetModel(UserModel).get(sessions.latecomer.userId);
      return uploadAvailability({ tenantId: DEFAULT_TENANT_ID, user });
    }

    after(async () => {
      await setRolePermissions(roles.latecomer, []);
    });

    it("serves the uploads page to the owner with the button enabled", async () => {
      const button = await uploadButton(owner);
      expect(button.disabled).to.not.equal(true);
    });

    it("keeps the uploads page from members: module pages are owner-only", async () => {
      await setRolePermissions(roles.latecomer, [
        LIBRARY_VIEW_PERMISSION,
        uploadsPagePermission,
        LIBRARY_UPLOAD_PERMISSION,
      ]);
      const [memberAccess, ownerAccess] = await Promise.all([
        readPageAccess(sessions.latecomer.client, MEDIA_ROUTES.uploads),
        readPageAccess(owner, MEDIA_ROUTES.uploads),
      ]);
      expect(ownerAccess).to.include({
        ownRouteStatus: HTTP_OK,
        hasAccess: true,
      });
      expect(ownerAccess.servedBlocks).to.be.greaterThan(0);
      expect(memberAccess).to.include({ hasAccess: false, servedBlocks: 0 });
      expect(memberAccess.ownRouteStatus).to.not.equal(HTTP_OK);
    });

    it("is disabled for a member who can upload to no folder", async () => {
      await setRolePermissions(roles.latecomer, [LIBRARY_VIEW_PERMISSION]);
      expect(await latecomerAvailability()).to.deep.equal({
        reason: "$dms_media.uploads.no_writable_folder",
      });
    });

    it("is enabled once the member may upload somewhere", async () => {
      await setRolePermissions(roles.latecomer, [
        LIBRARY_VIEW_PERMISSION,
        LIBRARY_UPLOAD_PERMISSION,
      ]);
      expect(await latecomerAvailability()).to.equal(undefined);
    });
  });

  describe("binding lifecycle", () => {
    it("resyncs the linked folder ACL when the mapping changes", async () => {
      RegisterAssetBinding({
        id: STOCK_BINDING_ID,
        folderName: STOCK_FOLDER_NAME,
        permissionMapping: {
          read: [WAREHOUSE_VIEW_PERMISSION],
          write: [WAREHOUSE_EDIT_PERMISSION],
        },
      });
      await fetchTree(owner);
      expect(await readFolderAcl(folders.stock)).to.deep.include(
        permissionEntry(WAREHOUSE_VIEW_PERMISSION, ["read"]),
      );
      const tree = await fetchTree(sessions.clerk.client);
      expect(
        requireById(tree, folders.stock).rights.write,
        "clerk keeps write after resync",
      ).to.equal(true);
    });
  });
});
