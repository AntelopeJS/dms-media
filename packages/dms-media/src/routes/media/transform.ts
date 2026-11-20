import { MediaApiController } from "./controller";
import { JSONBody, Parameter, Post } from "@antelopejs/interface-api";
import { assert, assertValidation } from "@antelopejs/interface-api-util";
import { revertImageTransform } from "../../transform";
import {
  requireEditableAsset,
  transformAsCopy,
  transformInPlace,
  translatingTransformErrors,
} from "../../services/transform";
import { transformSchema } from "../../validation/media.schema";
import { requireReadableAsset } from "./assets";
import { requireFolderRight } from "./context";
import { buildAssetDto } from "./dto";

const HTTP_CONFLICT = 409;

export class MediaTransformController extends MediaApiController {
  @Post("/assets/:assetId/transform")
  async transform(
    @Parameter("assetId", "param") assetId: string,
    @JSONBody() body: unknown,
  ) {
    const ops = assertValidation(body, (v) => transformSchema.parse(v));
    const context = await this.resolveContext();
    const asset = await requireEditableAsset(context, assetId);
    const updated = await transformInPlace(context, asset, ops);
    return { asset: buildAssetDto(context, updated) };
  }

  @Post("/assets/:assetId/transform/copy")
  async transformCopy(
    @Parameter("assetId", "param") assetId: string,
    @JSONBody() body: unknown,
  ) {
    const ops = assertValidation(body, (v) => transformSchema.parse(v));
    const context = await this.resolveContext();
    const asset = await requireEditableAsset(context, assetId);
    const copy = await transformAsCopy(context, asset, ops, "copy");
    return { asset: buildAssetDto(context, copy) };
  }

  @Post("/assets/:assetId/revert")
  async revert(@Parameter("assetId", "param") assetId: string) {
    const context = await this.resolveContext();
    const asset = await requireReadableAsset(context, assetId);
    requireFolderRight(context, asset.folderId, "write");
    assert(
      Boolean(asset.originalKey),
      HTTP_CONFLICT,
      "Asset has no original to revert to",
    );
    await translatingTransformErrors(
      revertImageTransform(context.assetModel, asset),
    );
    const updated = await context.assetModel.get(assetId);
    assert(updated, HTTP_CONFLICT, "Asset disappeared during revert");
    await this.record(context, {
      kind: "asset.revert",
      targetName: updated.name,
      folderId: updated.folderId,
      assetId,
    });
    return { asset: buildAssetDto(context, updated) };
  }
}
