import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { z } from "zod";
import { RegisterAssetBinding } from "@antelopejs/interface-dms-media";
import { GetPermissionId } from "@antelopejs/interface-dms/page";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { MediaUploadsPage } from "../../pages/uploads";
import { uploadAvailability } from "../../pages/upload-availability";
import { MEDIA_ROUTES } from "../../library/links";
import { createdBody, readBody } from "../helpers/bodies";
import { readFolderAcl, writeFolderAcl } from "../helpers/folders";
import { readPageAccess } from "../helpers/pages";
import { setRolePermissions } from "../helpers/members";

import {
  assets,
  createFolder,
  fetchTree,
  findById,
  folders,
  HTTP_FORBIDDEN,
  HTTP_NOT_FOUND,
  HTTP_OK,
  LIBRARY_UPLOAD_PERMISSION,
  LIBRARY_VIEW_PERMISSION,
  owner,
  permissionEntry,
  requireById,
  roleEntry,
  roles,
  sessions,
  STOCK_BINDING_ID,
  STOCK_FOLDER_NAME,
  WAREHOUSE_EDIT_PERMISSION,
  WAREHOUSE_VIEW_PERMISSION,
} from "../helpers/permissions-world";

const pageLayoutBody = z.object({
  layout: z.object({
    options: z.object({
      headerActions: z.array(z.object({ disabled: z.boolean().optional() })),
    }),
  }),
});

/** Folder management and ACL edition, run after the transform suites. */
export function folderManagementSuites(): void {
  describe("folder management and ACL edition", () => {
    folderManagementTests();
    folderAclTests();
  });
}

/** Who may create, rename, move and delete folders, and change their visibility. */
function folderManagementTests(): void {
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
    const managedId = readBody(created, createdBody).id;
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
    const nomadId = readBody(created, createdBody).id;
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
}

/** Stored folder ACLs, and what the owner may still do: flip visibility, but not unlock linked folders. */
function folderAclTests(): void {
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
}

/** Role updates, the uploads page button and the binding lifecycle, run last. */
export function laterPermissionSuites(): void {
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
      const [button] = readBody(layout, pageLayoutBody).layout.options
        .headerActions;
      return button;
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
      expect(button?.disabled).to.not.equal(true);
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
}
