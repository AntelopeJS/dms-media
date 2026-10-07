import { MediaApiController } from "./controller";
import { JSONBody, Parameter, Post } from "@antelopejs/interface-api";
import { assert, assertValidation } from "@antelopejs/interface-api-util";
import {
  AnimatedImageTransformError,
  applyImageTransform,
  revertImageTransform,
} from "../../transform";
import { transformSchema } from "../../validation/media.schema";
import { requireReadableAsset } from "./assets";
import { requireFolderRight } from "./context";
import { assertEditableAsset } from "./delivery";
import { buildAssetDto } from "./dto";

const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE_ENTITY = 422;

export class MediaTransformController extends MediaApiController {
  @Post("/assets/:assetId/transform")
  async transform(
    @Parameter("assetId", "param") assetId: string,
    @JSONBody() body: unknown,
  ) {
    const ops = assertValidation(body, (v) => transformSchema.parse(v));
    const context = await this.resolveContext();
    const asset = await requireReadableAsset(context, assetId);
    requireFolderRight(context, asset.folderId, "write");
    assertEditableAsset(asset);
    await applyImageTransform(context.assetModel, asset, ops).catch(
      (error: unknown) => {
        assert(
          !(error instanceof AnimatedImageTransformError),
          HTTP_UNPROCESSABLE_ENTITY,
          "Animated images cannot be edited",
        );
        throw error;
      },
    );
    const updated = await context.assetModel.get(assetId);
    assert(updated, HTTP_CONFLICT, "Asset disappeared during transform");
    return { asset: buildAssetDto(context, updated) };
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
    await revertImageTransform(context.assetModel, asset);
    const updated = await context.assetModel.get(assetId);
    assert(updated, HTTP_CONFLICT, "Asset disappeared during revert");
    return { asset: buildAssetDto(context, updated) };
  }
}
