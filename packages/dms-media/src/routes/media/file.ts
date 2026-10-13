import { Get, Parameter } from "@antelopejs/interface-api";
import type { KeyValueListItem } from "@antelopejs/interface-dms/base/key-value-list";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { getMediaConfig } from "../../config";
import type { BannerContent } from "@antelopejs/interface-dms/base/banner";
import type { BlockText } from "@antelopejs/interface-dms/base/types";
import type { MediaAsset, MediaFolder } from "../../db";
import { MEDIA_ROUTES } from "../../library/links";
import { DEFAULT_PRESETS, type MediaPresetConfig } from "../../presets";
import { derivativeFilename } from "../../derivatives";
import { composedText, numberParam } from "../../library/composed-text";
import {
  isDescribableImage,
  resolveTypeGroup,
} from "../../library/type-groups";
import { GetPermissionId } from "@antelopejs/interface-dms/page";
import { OWNER_WILDCARD_PERMISSION } from "../../constants";
import { MediaPresetsPage } from "../../pages/manage";
import { requireReadableAsset } from "./assets";
import type { MediaRequestContext } from "./context";
import { buildDeliveryPath, resolveEffectiveVisibility } from "./dto";
import { MediaApiController } from "./controller";

const FILE_TEXTS = "$dms_media.file";
const STABLE_LINK_COUNT = 1;
const STABLE_LINK_ID = "stable";
const ASSET_ID_ROW = "asset-id";
const PRESETS_LINK: KeyValueListItem = {
  id: "presets",
  label: `${FILE_TEXTS}.delivery_sizes`,
  value: `${FILE_TEXTS}.see_presets`,
  type: "link",
  to: MEDIA_ROUTES.presets,
};
const BUILT_IN_PRESET_IDS = new Set(DEFAULT_PRESETS.map((preset) => preset.id));
const EXTENSION_SEPARATOR = ".";
const MIMETYPE_SUFFIX_SEPARATOR = "+";

async function uploaderName(asset: MediaAsset): Promise<string | undefined> {
  const uploader = await GetModel(UserModel).get(asset.createdBy);
  return uploader ? uploader.name || uploader.email : undefined;
}

/** The delivery links of a file: its stable link, and one per preset for an image. */
export function countDeliveryLinks(asset: MediaAsset): number {
  return STABLE_LINK_COUNT + deliverablePresets(asset).length;
}

function deliverablePresets(asset: MediaAsset): MediaPresetConfig[] {
  return isDescribableImage(asset.mimetype)
    ? [...getMediaConfig().presets.values()]
    : [];
}

/** A delivery size's name: a translated one for the built-in sizes, else its id. */
function presetLabel(preset: MediaPresetConfig): string {
  return BUILT_IN_PRESET_IDS.has(preset.id)
    ? `${FILE_TEXTS}.preset_names.${preset.id}`
    : preset.id;
}

/** "300 × 300", "1600 px wide", "900 px high", or the original size. */
function presetSize(preset: MediaPresetConfig): BlockText {
  const { width, height } = preset;
  if (width && height) return `${width} × ${height}`;
  if (width)
    return composedText(`${FILE_TEXTS}.preset_width`, {
      width: numberParam(width),
    });
  if (height)
    return composedText(`${FILE_TEXTS}.preset_height`, {
      height: numberParam(height),
    });
  return `${FILE_TEXTS}.preset_original_size`;
}

function deliveryRow(
  id: string,
  label: string,
  path: string,
  origin: string,
): KeyValueListItem {
  return {
    id,
    label,
    value: path,
    type: "mono",
    copyValue: `${origin}${path}`,
  };
}

/**
 * The links a file is delivered on, each with a button copying its full URL
 * on the dashboard's public origin, then its id and the way to every
 * delivery size. A size's link ends with the extension of the format it
 * serves (`photo-01-thumb.webp`), not the original's.
 */
export function buildDeliveryLinks(
  asset: MediaAsset,
  origin: string,
  canOpenPresets: boolean,
): KeyValueListItem[] {
  const presetRows = deliverablePresets(asset).map((preset) => ({
    ...deliveryRow(
      preset.id,
      presetLabel(preset),
      `/media/${asset._id}/${preset.id}/${encodeURIComponent(derivativeFilename(asset, preset))}`,
      origin,
    ),
    detail: presetSize(preset),
  }));
  return [
    deliveryRow(
      STABLE_LINK_ID,
      `${FILE_TEXTS}.stable_link`,
      buildDeliveryPath(asset),
      origin,
    ),
    ...presetRows,
    {
      id: ASSET_ID_ROW,
      label: `${FILE_TEXTS}.asset_id`,
      value: asset._id,
      type: "mono",
      copy: true,
    },
    ...(canOpenPresets ? [PRESETS_LINK] : []),
  ];
}

/**
 * How a file is served, by its effective visibility. A private file's notice
 * points to Details › Visibility, where making it public is confirmed and can
 * be undone.
 */
export function buildDeliveryNotice(
  asset: MediaAsset,
  folder: MediaFolder | undefined,
): BannerContent {
  const isPublic = resolveEffectiveVisibility(asset, folder) === "public";
  return {
    tone: isPublic ? "success" : "info",
    icon: isPublic ? "i-ph-globe" : "i-ph-lock-simple",
    size: "sm",
    description: isPublic
      ? `${FILE_TEXTS}.delivery_public`
      : `${FILE_TEXTS}.delivery_private_notice`,
  };
}

function canOpenPage(
  context: MediaRequestContext,
  page: typeof MediaPresetsPage,
): boolean {
  const permissionId = GetPermissionId(page);
  return (
    context.permissions.has(OWNER_WILDCARD_PERMISSION) ||
    (permissionId !== undefined && context.permissions.has(permissionId))
  );
}

/** `photo.final.JPG` → `JPG`; a name without one falls back on the mimetype. */
function displayedExtension(asset: MediaAsset): string {
  const dot = asset.name.lastIndexOf(EXTENSION_SEPARATOR);
  const fromName =
    dot > 0 && dot < asset.name.length - 1 ? asset.name.slice(dot + 1) : "";
  const fromMimetype =
    asset.mimetype.split("/").at(-1)?.split(MIMETYPE_SUFFIX_SEPARATOR)[0] ?? "";
  return (fromName || fromMimetype).toUpperCase();
}

/**
 * The facts the file page lists under its properties, in the owner's words:
 * the type as "Image · JPG" rather than its mimetype. The id sits with the
 * delivery links, for developers.
 */
export function buildFileInformation(
  asset: MediaAsset,
  uploadedBy: string | undefined,
): KeyValueListItem[] {
  return [
    {
      id: "uploaded",
      label: `${FILE_TEXTS}.uploaded`,
      value: asset.createdAt.toISOString(),
      type: "date",
      detail: uploadedBy,
    },
    {
      id: "modified",
      label: "$dms_media.columns.modified",
      value: asset.updatedAt.toISOString(),
      type: "date",
      detail: asset.originalKey ? `${FILE_TEXTS}.edited` : undefined,
    },
    {
      id: "type",
      label: "$dms_media.columns.type",
      value: composedText(`${FILE_TEXTS}.type_value`, {
        group: composedText(
          `${FILE_TEXTS}.type_names.${resolveTypeGroup(asset.mimetype)}`,
        ),
        extension: displayedExtension(asset),
      }),
    },
  ];
}

export class MediaFileController extends MediaApiController {
  /** The origin the file explorer builds the links it copies on. */
  @Get("/links/origin")
  async linksOrigin() {
    await this.resolveContext();
    return { origin: await this.publicOrigin() };
  }

  @Get("/assets/:assetId/information")
  async information(@Parameter("assetId", "param") assetId: string) {
    const context = await this.resolveContext();
    const asset = await requireReadableAsset(context, assetId);
    return {
      items: buildFileInformation(asset, await uploaderName(asset)),
    };
  }

  @Get("/assets/:assetId/delivery")
  async delivery(@Parameter("assetId", "param") assetId: string) {
    const context = await this.resolveContext();
    const asset = await requireReadableAsset(context, assetId);
    return {
      items: buildDeliveryLinks(
        asset,
        await this.publicOrigin(),
        canOpenPage(context, MediaPresetsPage),
      ),
    };
  }

  @Get("/assets/:assetId/delivery/notice")
  async deliveryNotice(@Parameter("assetId", "param") assetId: string) {
    const context = await this.resolveContext();
    const asset = await requireReadableAsset(context, assetId);
    return buildDeliveryNotice(asset, context.foldersById.get(asset.folderId));
  }

  @Get("/assets/:assetId/tab-counts")
  async tabCounts(@Parameter("assetId", "param") assetId: string) {
    const context = await this.resolveContext();
    const asset = await requireReadableAsset(context, assetId);
    return { delivery: countDeliveryLinks(asset) };
  }
}
