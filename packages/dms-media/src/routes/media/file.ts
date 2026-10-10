import { Get, Parameter } from "@antelopejs/interface-api";
import type { KeyValueListItem } from "@antelopejs/interface-dms/base/key-value-list";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { getMediaConfig } from "../../config";
import type { BannerContent } from "@antelopejs/interface-dms/base/banner";
import type { MediaAsset, MediaFolder } from "../../db";
import { MEDIA_ROUTES } from "../../library/links";
import { type MediaPresetConfig } from "../../presets";
import { composedText } from "../../library/composed-text";
import { isDescribableImage } from "../../library/type-groups";
import { requireReadableAsset } from "./assets";
import { buildDeliveryPath, resolveEffectiveVisibility } from "./dto";
import { MediaApiController } from "./controller";

const FILE_TEXTS = "$dms_media.file";
const STABLE_LINK_COUNT = 1;
const STABLE_LINK_ID = "stable";
const SIZE_UNSET = "–";

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

function presetSize(preset: MediaPresetConfig): string {
  return `${preset.width ?? SIZE_UNSET} × ${preset.height ?? SIZE_UNSET}`;
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

/** The links a file is delivered on, each with a button copying its full URL. */
export function buildDeliveryLinks(
  asset: MediaAsset,
  origin: string,
): KeyValueListItem[] {
  const presetRows = deliverablePresets(asset).map((preset) => ({
    ...deliveryRow(
      preset.id,
      preset.id,
      `/media/${asset._id}/${preset.id}/${encodeURIComponent(asset.name)}`,
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
  ];
}

/** How a file is served, by its effective visibility. */
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
      : `${FILE_TEXTS}.delivery_private`,
    actions: [
      {
        label: `${FILE_TEXTS}.see_presets`,
        to: MEDIA_ROUTES.presets,
        icon: "i-ph-frame-corners",
        variant: "link",
      },
    ],
  };
}

/** The facts the file page lists under its properties. */
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
      value: composedText(`${FILE_TEXTS}.modified_value`, {
        date: { type: "relative", value: asset.updatedAt.toISOString() },
      }),
      detail: asset.originalKey ? `${FILE_TEXTS}.edited` : undefined,
    },
    {
      id: "type",
      label: "$dms_media.columns.type",
      value: asset.mimetype,
      type: "mono",
    },
    {
      id: "asset-id",
      label: `${FILE_TEXTS}.asset_id`,
      value: asset._id,
      type: "mono",
    },
  ];
}

export class MediaFileController extends MediaApiController {
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
    return { items: buildDeliveryLinks(asset, this.requestOrigin()) };
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
