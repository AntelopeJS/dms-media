import type { AxiosInstance } from "axios";
import { assert, expect } from "chai";
import { z } from "zod";
import { RegisterAssetBinding } from "@antelopejs/interface-dms-media";
import {
  configureMediaModule,
  type DmsMediaConfig,
  getMediaConfig,
} from "../../config";
import { MEDIA_PAGE_PERMISSION } from "../../pages/files";
import type { AclEntry } from "../../types";
import { createdBody, readBody } from "../helpers/bodies";
import {
  type UploadedAsset,
  uploadPixelPng,
  uploadTextAsset,
} from "../helpers/assets";
import { writeFolderAcl } from "../helpers/folders";
import { authorizedClient } from "../helpers/http";
import {
  createRole,
  type MemberSession,
  registerMember,
} from "../helpers/members";
import { ensureOwnerSession } from "../helpers/owner";

export const HTTP_OK = 200;
export const HTTP_FOUND = 302;
export const HTTP_FORBIDDEN = 403;
export const HTTP_NOT_FOUND = 404;

export const LIBRARY_VIEW_PERMISSION = "warehouse.library.view";
export const LIBRARY_UPLOAD_PERMISSION = "warehouse.library.upload";
export const LIBRARY_MANAGE_PERMISSION = "warehouse.library.manage";
export const WAREHOUSE_EDIT_PERMISSION = "warehouse.table.edit";
export const WAREHOUSE_VIEW_PERMISSION = "warehouse.page";
export const STOCK_BINDING_ID = "warehouse.stock";
export const STOCK_FOLDER_NAME = "Warehouse stock";
export const CONTENT_ROOT_NAME = "Content";
export const ROTATE_QUARTER_TURN = 90;

const treeFolderNodeBody = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  shell: z.boolean(),
  bound: z.boolean(),
  visibility: z.string(),
  rights: z.object({
    read: z.boolean(),
    write: z.boolean(),
    manage: z.boolean(),
  }),
});

const treeBody = z.object({
  folders: z.array(treeFolderNodeBody),
  root: z.object({ write: z.boolean(), manage: z.boolean() }),
});

export type TreeFolderNode = z.infer<typeof treeFolderNodeBody>;
export type TreeResponse = z.infer<typeof treeBody>;

export interface WorldRoles {
  pageHolder: string;
  viewer: string;
  uploader: string;
  folderManager: string;
  clerk: string;
  secretTeam: string;
  latecomer: string;
}

export interface WorldSessions {
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

export interface WorldFolders {
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

export interface WorldAssets {
  notes: UploadedAsset;
  secretText: UploadedAsset;
  secretPng: UploadedAsset;
  libraryPng: UploadedAsset;
}

export async function fetchTree(client: AxiosInstance): Promise<TreeResponse> {
  const response = await client.get("/api/media/tree");
  expect(response.status, "tree").to.equal(HTTP_OK);
  return readBody(response, treeBody);
}

export function findByName(
  tree: TreeResponse,
  name: string,
): TreeFolderNode | undefined {
  return tree.folders.find((folder) => folder.name === name);
}

export function findById(
  tree: TreeResponse,
  id: string,
): TreeFolderNode | undefined {
  return tree.folders.find((folder) => folder.id === id);
}

/** The folder `id` of the tree, failing the test when the tree does not show it. */
export function requireById(tree: TreeResponse, id: string): TreeFolderNode {
  const folder = findById(tree, id);
  assert.isDefined(folder, `folder ${id}`);
  return folder;
}

export async function createFolder(
  owner: AxiosInstance,
  name: string,
  parentId?: string,
): Promise<string> {
  const response = await owner.post("/api/media/folders", { name, parentId });
  expect(response.status, `create folder ${name}`).to.equal(HTTP_OK);
  return readBody(response, createdBody).id;
}

export function roleEntry(
  roleId: string,
  rights: AclEntry["rights"],
): AclEntry {
  return { subject: { kind: "role", id: roleId }, rights };
}

export function permissionEntry(
  id: string,
  rights: AclEntry["rights"],
): AclEntry {
  return { subject: { kind: "permission", id }, rights };
}

export function snapshotMediaConfig(): DmsMediaConfig {
  const config = getMediaConfig();
  return {
    rootAcl: config.rootAcl,
    storage: config.storage,
    presets: [...config.presets.values()],
    storageQuotaBytes: config.storageQuotaBytes,
  };
}

export function grantLibraryAtRoot(config: DmsMediaConfig): void {
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

export async function createWorldRoles(): Promise<WorldRoles> {
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

export async function registerWorldMembers(
  roles: WorldRoles,
): Promise<WorldSessions> {
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

export async function buildWorldFolders(
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

export async function seedWorldAssets(
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

/** The owner's client, once the world is set up. */
export let owner: AxiosInstance;
/** The roles of the world's members, by what they hold. */
export let roles: WorldRoles;
/** The world's members, signed in. */
export let sessions: WorldSessions;
/** The world's folders, by role in the tests. */
export let folders: WorldFolders;
/** The assets seeded into the world's folders. */
export let assets: WorldAssets;
let previousConfig: DmsMediaConfig;

/** Builds the world every permissions suite reads: root grant, binding, roles, members, folders and assets. */
export async function setUpPermissionsWorld(): Promise<void> {
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
}

/** Deletes the world's top-level folders and puts the module's configuration back. */
export async function tearDownPermissionsWorld(): Promise<void> {
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
}
