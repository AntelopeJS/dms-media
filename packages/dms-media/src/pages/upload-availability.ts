import { GetModel } from "@antelopejs/interface-database-decorators";
import type { CustomButtonAvailability } from "@antelopejs/interface-dms/base/types";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import { MediaFolderModel } from "../db";
import { resolveActorAccess } from "../routes/media/context";

const NO_WRITABLE_FOLDER = { reason: "$dms_media.uploads.no_writable_folder" };

/** Disables an upload button for a member who can upload to no folder. */
export const uploadAvailability: CustomButtonAvailability = async ({
  tenantId,
  user,
}) => {
  if (!user) return NO_WRITABLE_FOLDER;
  const { access } = await resolveActorAccess({
    tenantId,
    user,
    folderModel: GetModel(MediaFolderModel, tenantId),
    roleModel: GetModel(RoleModel, tenantId),
    memberModel: GetModel(TenantMemberModel, tenantId),
  });
  return access.writable.size > 0 ? undefined : NO_WRITABLE_FOLDER;
};
