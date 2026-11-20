import { z } from "zod";
import { bindingFolderId } from "../../bindings";
import type { MediaFolder } from "../../db";
import type { MediaRequestContext } from "../../routes/media/context";
import {
  applyEnsureFolder,
  type EnsureFolderPlan,
  planEnsureFolder,
} from "../../services/folders";
import { nameSchema } from "../../validation/media.schema";
import {
  folderTargetFields,
  objectSchema,
  TENANT_INPUT,
  tenantIdField,
  writeAction,
} from "./support";

const FOLDER_VISIBILITIES = ["private", "public"] as const;

const input = z
  .object({
    tenantId: tenantIdField,
    name: nameSchema,
    parentId: folderTargetFields.folderId,
    parentBinding: folderTargetFields.binding,
    visibility: z.enum(FOLDER_VISIBILITIES).default("private"),
  })
  .refine(
    (value) =>
      value.parentId === undefined || value.parentBinding === undefined,
    { message: "give parentId or parentBinding, not both" },
  );

interface EnsurePlan {
  context: MediaRequestContext;
  plan: EnsureFolderPlan;
}

function pathOf(
  context: MediaRequestContext,
  parent: MediaFolder | undefined,
  name: string,
): string {
  const parentPath = parent ? pathNames(context, parent) : [];
  return [...parentPath, name].join("/");
}

function pathNames(
  context: MediaRequestContext,
  folder: MediaFolder,
): string[] {
  return [...folder.path, folder._id].map(
    (id) => context.foldersById.get(id)?.name ?? "",
  );
}

function outputOf(
  context: MediaRequestContext,
  folder: Pick<MediaFolder, "_id" | "name" | "parentId" | "visibility">,
  created: boolean,
  parent: MediaFolder | undefined,
) {
  return {
    folderId: folder._id,
    created,
    name: folder.name,
    parentId: folder.parentId ?? null,
    folderPath: pathOf(context, parent, folder.name),
    visibility: folder.visibility,
  };
}

export const ensureFolderAction = writeAction({
  id: "media.ensure-folder",
  name: "Ensure folder",
  description:
    "Returns the folder with this name under a parent, creating it when it does not exist yet.",
  icon: "i-lucide-folder-plus",
  inputSchema: objectSchema(
    {
      tenantId: TENANT_INPUT,
      name: {
        type: "string",
        maxLength: 255,
        description:
          "Folder name; an existing folder matches regardless of case",
      },
      parentId: {
        type: "string",
        maxLength: 64,
        description:
          "Parent folder. Leave this and `parentBinding` empty for the library root.",
      },
      parentBinding: {
        type: "string",
        maxLength: 255,
        description:
          "Parent = the folder linked to this asset field, which must allow subfolders.",
      },
      visibility: {
        type: "string",
        enum: [...FOLDER_VISIBILITIES],
        default: "private",
        description: "Applied only when the folder is created.",
      },
    },
    ["name"],
  ),
  outputSchema: objectSchema({
    folderId: { type: "string" },
    created: { type: "boolean" },
    name: {
      type: "string",
      description: "Stored name: an existing folder keeps its own",
    },
    parentId: { type: ["string", "null"] },
    folderPath: {
      type: "string",
      description: "Folder names from the root, joined with `/`",
    },
    visibility: { type: "string", enum: [...FOLDER_VISIBILITIES] },
  }),
  input,
  async plan(context, value): Promise<EnsurePlan> {
    const parentId = value.parentBinding
      ? bindingFolderId(context.tenantId, value.parentBinding)
      : value.parentId;
    if (parentId && !context.foldersById.has(parentId))
      throw new Error("Folder not found");
    return {
      context,
      plan: planEnsureFolder(context, value.name, parentId, value.visibility),
    };
  },
  async apply(context, { plan }) {
    const { folder, created } = await applyEnsureFolder(context, plan);
    return outputOf(context, folder, created, plan.parent);
  },
  simulate({ context, plan }) {
    if (plan.existing)
      return outputOf(context, plan.existing, false, plan.parent);
    return outputOf(
      context,
      {
        _id: plan.id,
        name: plan.name,
        parentId: plan.parent?._id,
        visibility: plan.visibility,
      },
      true,
      plan.parent,
    );
  },
  skipped: ({ plan }) =>
    plan.existing
      ? `nothing: folder ${plan.existing._id} exists`
      : `creation of folder "${plan.name}"`,
});
