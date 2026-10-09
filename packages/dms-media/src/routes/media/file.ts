import { Get, Parameter } from "@antelopejs/interface-api";
import type { KeyValueListItem } from "@antelopejs/interface-dms/base/key-value-list";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { getMediaConfig } from "../../config";
import type { MediaAsset } from "../../db";
import { composedText } from "../../library/composed-text";
import { isDescribableImage } from "../../library/type-groups";
import { requireReadableAsset } from "./assets";
import { MediaApiController } from "./controller";

const FILE_TEXTS = "$dms_media.file";
const STABLE_LINK_COUNT = 1;

async function uploaderName(asset: MediaAsset): Promise<string | undefined> {
  const uploader = await GetModel(UserModel).get(asset.createdBy);
  return uploader ? uploader.name || uploader.email : undefined;
}

/** The delivery links of a file: its stable link, and one per preset for an image. */
export function countDeliveryLinks(asset: MediaAsset): number {
  const presets = isDescribableImage(asset.mimetype)
    ? getMediaConfig().presets.size
    : 0;
  return STABLE_LINK_COUNT + presets;
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

  @Get("/assets/:assetId/tab-counts")
  async tabCounts(@Parameter("assetId", "param") assetId: string) {
    const context = await this.resolveContext();
    const asset = await requireReadableAsset(context, assetId);
    return { delivery: countDeliveryLinks(asset) };
  }
}
