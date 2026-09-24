import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { RegisterAssetBinding } from "../../asset-type/bindings";
import {
  MEDIA_FOLDERS_MANAGE_PERMISSION,
  MEDIA_PERMISSIONS_MANAGE_PERMISSION,
  MEDIA_UPLOAD_PERMISSION,
} from "../../constants";
import { MEDIA_PAGE_PERMISSION } from "../../pages/media";
import type { AclEntry } from "../../types";
import {
  rawGet,
  type UploadedAsset,
  uploadPixelPng,
  uploadTextAsset,
} from "../helpers/assets";
import { authorizedClient } from "../helpers/http";
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
  viewer: string;
  uploader: string;
  folderManager: string;
  permissionsManager: string;
  clerk: string;
  secretTeam: string;
  latecomer: string;
}

interface WorldSessions {
  viewer: MemberSession;
  uploader: MemberSession;
  folderManager: MemberSession;
  permissionsManager: MemberSession;
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

async function createFolder(
  owner: AxiosInstance,
  name: string,
  parentId?: string,
): Promise<string> {
  const response = await owner.post("/api/media/folders", { name, parentId });
  expect(response.status, `create folder ${name}`).to.equal(HTTP_OK);
  return response.data.id;
}

async function setFolderAcl(
  owner: AxiosInstance,
  folderId: string,
  entries: AclEntry[] | null,
): Promise<void> {
  const response = await owner.put(`/api/media/folders/${folderId}/acl`, {
    entries,
  });
  expect(response.status, "set folder acl").to.equal(HTTP_OK);
}

function roleEntry(roleId: string, rights: AclEntry["rights"]): AclEntry {
  return { subject: { kind: "role", id: roleId }, rights };
}

function permissionEntry(id: string, rights: AclEntry["rights"]): AclEntry {
  return { subject: { kind: "permission", id }, rights };
}

async function createWorldRoles(): Promise<WorldRoles> {
  const [
    viewer,
    uploader,
    folderManager,
    permissionsManager,
    clerk,
    secretTeam,
    latecomer,
  ] = await Promise.all([
    createRole("media-viewer", [MEDIA_PAGE_PERMISSION]),
    createRole("media-uploader", [
      MEDIA_PAGE_PERMISSION,
      MEDIA_UPLOAD_PERMISSION,
    ]),
    createRole("media-folder-manager", [
      MEDIA_PAGE_PERMISSION,
      MEDIA_FOLDERS_MANAGE_PERMISSION,
    ]),
    createRole("media-permissions-manager", [
      MEDIA_PAGE_PERMISSION,
      MEDIA_FOLDERS_MANAGE_PERMISSION,
      MEDIA_PERMISSIONS_MANAGE_PERMISSION,
    ]),
    createRole("warehouse-clerk", [WAREHOUSE_EDIT_PERMISSION]),
    createRole("secret-team", []),
    createRole("latecomer", []),
  ]);
  return {
    viewer,
    uploader,
    folderManager,
    permissionsManager,
    clerk,
    secretTeam,
    latecomer,
  };
}

async function registerWorldMembers(roles: WorldRoles): Promise<WorldSessions> {
  return {
    viewer: await registerMember("Viewer", [roles.viewer]),
    uploader: await registerMember("Uploader", [roles.uploader]),
    folderManager: await registerMember("FolderManager", [roles.folderManager]),
    permissionsManager: await registerMember("PermissionsManager", [
      roles.permissionsManager,
    ]),
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
  await setFolderAcl(owner, restricted, [
    roleEntry(secretTeamRoleId, ["write"]),
  ]);
  await setFolderAcl(owner, vault, []);
  await setFolderAcl(owner, pocket, [roleEntry(secretTeamRoleId, ["read"])]);
  await setFolderAcl(owner, readOnlyCorner, [
    permissionEntry(MEDIA_PAGE_PERMISSION, ["read"]),
  ]);
  const flip = await owner.post(`/api/media/folders/${publicZone}/visibility`, {
    visibility: "public",
  });
  expect(flip.status, "flip PublicZone public").to.equal(HTTP_OK);
  const tree = await fetchTree(owner);
  const stock = findByName(tree, STOCK_FOLDER_NAME);
  const contentRoot = findByName(tree, CONTENT_ROOT_NAME);
  expect(stock, "provisioned stock folder").to.not.equal(undefined);
  expect(contentRoot, "provisioned content root").to.not.equal(undefined);
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
    stock: (stock as TreeFolderNode).id,
    contentRoot: (contentRoot as TreeFolderNode).id,
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

  before(async function () {
    this.timeout(SETUP_TIMEOUT_MS);
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
  });

  describe("tree visibility", () => {
    it("shows nothing to a member with no roles", async () => {
      const tree = await fetchTree(sessions.outsider.client);
      expect(tree.folders).to.deep.equal([]);
      expect(tree.root).to.deep.equal({ write: false, manage: false });
    });

    it("shows only root-inherited folders to a media page permission holder", async () => {
      const tree = await fetchTree(sessions.viewer.client);
      const library = findById(tree, folders.library);
      expect(library, "library").to.not.equal(undefined);
      expect((library as TreeFolderNode).rights).to.deep.equal({
        read: true,
        write: false,
        manage: false,
      });
      expect((library as TreeFolderNode).shell).to.equal(false);
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
      expect(
        (findById(tree, folders.restricted) as TreeFolderNode).rights,
      ).to.deep.equal({ read: true, write: true, manage: false });
      expect(
        (findById(tree, folders.deep) as TreeFolderNode).rights.write,
      ).to.equal(true);
      const pocket = findById(tree, folders.pocket) as TreeFolderNode;
      expect(pocket.rights).to.deep.equal({
        read: true,
        write: false,
        manage: false,
      });
      const vault = findById(tree, folders.vault) as TreeFolderNode;
      expect(vault.shell, "vault is a traverse-only shell").to.equal(true);
      expect(vault.rights.read).to.equal(false);
      expect(findById(tree, folders.library)).to.equal(undefined);
      expect(tree.root).to.deep.equal({ write: false, manage: false });
    });

    it("auto-grants the linked folder to consumer permission holders", async () => {
      const tree = await fetchTree(sessions.clerk.client);
      const stock = findById(tree, folders.stock) as TreeFolderNode;
      expect(stock, "linked stock folder").to.not.equal(undefined);
      expect(stock.rights).to.deep.equal({
        read: true,
        write: true,
        manage: false,
      });
      const contentRoot = findById(tree, folders.contentRoot) as TreeFolderNode;
      expect(contentRoot.shell, "content root is a shell").to.equal(true);
      expect(findById(tree, folders.library)).to.equal(undefined);
    });

    it("unions permission and role subjects across multiple roles", async () => {
      const tree = await fetchTree(sessions.hybrid.client);
      const library = findById(tree, folders.library);
      expect(library, "library via the media page permission").to.not.equal(
        undefined,
      );
      expect((library as TreeFolderNode).rights.read).to.equal(true);
      const restricted = findById(tree, folders.restricted);
      expect(restricted, "restricted via secret-team").to.not.equal(undefined);
      expect((restricted as TreeFolderNode).rights.write).to.equal(true);
    });

    it("expands implied rights for uploader and folder manager", async () => {
      const uploaderTree = await fetchTree(sessions.uploader.client);
      expect(uploaderTree.root).to.deep.equal({ write: true, manage: false });
      expect(
        (findById(uploaderTree, folders.library) as TreeFolderNode).rights,
      ).to.deep.equal({ read: true, write: true, manage: false });

      const managerTree = await fetchTree(sessions.folderManager.client);
      expect(managerTree.root).to.deep.equal({ write: true, manage: true });
      expect(
        (findById(managerTree, folders.library) as TreeFolderNode).rights,
      ).to.deep.equal({ read: true, write: true, manage: true });
      expect(
        (findById(managerTree, folders.stock) as TreeFolderNode).rights.manage,
        "binding keeps media managers in control",
      ).to.equal(true);
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
      await setFolderAcl(owner, cellar, [
        permissionEntry(MEDIA_PERMISSIONS_MANAGE_PERMISSION, ["manage"]),
      ]);
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

    it("keeps ACL and visibility edition behind media.permissions.manage", async () => {
      const aclRead = await sessions.folderManager.client.get(
        `/api/media/folders/${folders.depot}/acl`,
      );
      expect(aclRead.status).to.equal(HTTP_FORBIDDEN);
      const aclWrite = await sessions.folderManager.client.put(
        `/api/media/folders/${folders.depot}/acl`,
        { entries: [] },
      );
      expect(aclWrite.status).to.equal(HTTP_FORBIDDEN);
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

    it("blocks ACL reads below the manage right", async () => {
      const denied = await sessions.viewer.client.get(
        `/api/media/folders/${folders.library}/acl`,
      );
      expect(denied.status).to.equal(HTTP_FORBIDDEN);
    });

    it("lets a permissions manager edit ACLs with immediate effect", async () => {
      const before = await fetchTree(sessions.viewer.client);
      expect(findById(before, folders.curtain), "curtain visible").to.not.equal(
        undefined,
      );
      const inherited = await sessions.permissionsManager.client.get(
        `/api/media/folders/${folders.curtain}/acl`,
      );
      expect(inherited.status).to.equal(HTTP_OK);
      expect(inherited.data.entries).to.equal(null);
      const selfPreservingEntries = [
        roleEntry(roles.secretTeam, ["manage"]),
        permissionEntry(MEDIA_PERMISSIONS_MANAGE_PERMISSION, ["manage"]),
      ];
      const lock = await sessions.permissionsManager.client.put(
        `/api/media/folders/${folders.curtain}/acl`,
        { entries: selfPreservingEntries },
      );
      expect(lock.status).to.equal(HTTP_OK);
      const acl = await sessions.permissionsManager.client.get(
        `/api/media/folders/${folders.curtain}/acl`,
      );
      expect(acl.status).to.equal(HTTP_OK);
      expect(acl.data.entries).to.deep.include(
        roleEntry(roles.secretTeam, ["manage"]),
      );
      const hidden = await fetchTree(sessions.viewer.client);
      expect(findById(hidden, folders.curtain), "curtain hidden").to.equal(
        undefined,
      );
    });

    it("lets an ACL override lock out its own author", async () => {
      const selfExclusion = await sessions.permissionsManager.client.put(
        `/api/media/folders/${folders.curtain}/acl`,
        { entries: [roleEntry(roles.secretTeam, ["manage"])] },
      );
      expect(selfExclusion.status).to.equal(HTTP_OK);
      const lockedOut = await sessions.permissionsManager.client.get(
        `/api/media/folders/${folders.curtain}/acl`,
      );
      expect(lockedOut.status).to.equal(HTTP_NOT_FOUND);
    });

    it("restores inheritance when the ACL is cleared", async () => {
      const clear = await owner.put(
        `/api/media/folders/${folders.curtain}/acl`,
        { entries: null },
      );
      expect(clear.status).to.equal(HTTP_OK);
      const tree = await fetchTree(sessions.viewer.client);
      expect(findById(tree, folders.curtain), "curtain back").to.not.equal(
        undefined,
      );
    });

    it("lets a permissions manager flip folder and asset visibility", async () => {
      const folderFlip = await sessions.permissionsManager.client.post(
        `/api/media/folders/${folders.curtain}/visibility`,
        { visibility: "public" },
      );
      expect(folderFlip.status).to.equal(HTTP_OK);
      const folderBack = await sessions.permissionsManager.client.post(
        `/api/media/folders/${folders.curtain}/visibility`,
        { visibility: "private" },
      );
      expect(folderBack.status).to.equal(HTTP_OK);
      const assetFlip = await sessions.permissionsManager.client.post(
        `/api/media/assets/${assets.notes.id}/visibility`,
        { visibility: "private" },
      );
      expect(assetFlip.status).to.equal(HTTP_OK);
      const assetBack = await sessions.permissionsManager.client.post(
        `/api/media/assets/${assets.notes.id}/visibility`,
        { visibility: "inherit" },
      );
      expect(assetBack.status).to.equal(HTTP_OK);
    });

    it("keeps linked folders locked even for a permissions manager", async () => {
      const reAcl = await sessions.permissionsManager.client.put(
        `/api/media/folders/${folders.stock}/acl`,
        { entries: [] },
      );
      expect(reAcl.status).to.equal(HTTP_FORBIDDEN);
      const rename = await sessions.permissionsManager.client.post(
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
      await setRolePermissions(roles.latecomer, [MEDIA_PAGE_PERMISSION]);
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
      const acl = await owner.get(`/api/media/folders/${folders.stock}/acl`);
      expect(acl.status).to.equal(HTTP_OK);
      expect(acl.data.entries).to.deep.include(
        permissionEntry(WAREHOUSE_VIEW_PERMISSION, ["read"]),
      );
      const tree = await fetchTree(sessions.clerk.client);
      expect(
        (findById(tree, folders.stock) as TreeFolderNode).rights.write,
        "clerk keeps write after resync",
      ).to.equal(true);
    });
  });
});
