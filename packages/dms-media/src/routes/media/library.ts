import { Get, JSONBody, Parameter, Post } from "@antelopejs/interface-api";
import { assert, assertValidation } from "@antelopejs/interface-api-util";
import { HasPermission } from "@antelopejs/interface-dms/permissions";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { getMediaConfig } from "../../config";
import { MEDIA_PERMISSIONS_MANAGE_PERMISSION } from "../../constants";
import type { MediaAsset } from "../../db";
import { loadStarredTargets, setStarred } from "../../library/favorites";
import { computeFolderStats } from "../../library/folder-stats";
import {
  countByTypeGroup,
  loadAssetsInFolders,
  pageAssets,
} from "../../library/listing";
import { searchAssets, searchFolders } from "../../library/search";
import { isDescribableImage } from "../../library/type-groups";
import {
  favoriteSchema,
  listingQuerySchema,
  type ListingQuery,
  searchQuerySchema,
  type SmartView,
  smartViewSchema,
  starterFoldersSchema,
} from "../../validation/library.schema";
import { MAX_UPLOAD_SIZE_BYTES } from "../../validation/media.schema";
import { requireReadableAsset } from "./assets";
import { MediaApiController } from "./controller";
import {
  getDescendantFolders,
  type MediaRequestContext,
  requireFolderRight,
  requireVisibleFolder,
} from "./context";
import {
  buildAssetDto,
  buildFolderDto,
  listVisibleFolders,
  resolveEffectiveVisibility,
} from "./dto";

const HTTP_FORBIDDEN = 403;
const HTTP_CONFLICT = 409;
const RECENT_VIEW_LIMIT = 200;

type SmartViewFilter = (
  assets: MediaAsset[],
  starredAssetIds: Set<string>,
) => MediaAsset[];

const SMART_VIEW_FILTERS: Record<SmartView, SmartViewFilter> = {
  recent: (assets) =>
    [...assets]
      .sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      )
      .slice(0, RECENT_VIEW_LIMIT),
  starred: (assets, starredAssetIds) =>
    assets.filter((asset) => starredAssetIds.has(asset._id)),
  "missing-alt": (assets) =>
    assets.filter(
      (asset) => isDescribableImage(asset.mimetype) && !asset.alt?.trim(),
    ),
};

function readableAssets(context: MediaRequestContext): Promise<MediaAsset[]> {
  return loadAssetsInFolders(context.assetModel, [...context.access.readable]);
}

function countMissingAlt(assets: MediaAsset[]): number {
  return SMART_VIEW_FILTERS["missing-alt"](assets, new Set()).length;
}

function searchScope(
  context: MediaRequestContext,
  folderId: string | undefined,
): string[] {
  if (!folderId) return [...context.access.readable];
  requireFolderRight(context, folderId, "read");
  const descendants = getDescendantFolders(context, folderId)
    .map((folder) => folder._id)
    .filter((id) => context.access.readable.has(id));
  return [folderId, ...descendants];
}

export class MediaLibraryController extends MediaApiController {
  private owner(context: MediaRequestContext) {
    return { tenantId: context.tenantId, userId: context.user._id };
  }

  @Get("/tree")
  async tree() {
    const context = await this.resolveContext();
    const [assets, starred, canManagePermissions] = await Promise.all([
      readableAssets(context),
      loadStarredTargets(this.owner(context)),
      HasPermission(context.permissions, MEDIA_PERMISSIONS_MANAGE_PERMISSION),
    ]);
    const stats = computeFolderStats(context.folders, assets);
    return {
      folders: listVisibleFolders(context, stats, starred.folderIds),
      root: {
        write: context.rootRights.has("write"),
        manage: context.rootRights.has("manage"),
        fileCount: assets.length,
        size: assets.reduce((total, asset) => total + asset.size, 0),
      },
      views: {
        starred:
          assets.filter((asset) => starred.assetIds.has(asset._id)).length +
          starred.folderIds.size,
        missingAlt: countMissingAlt(assets),
      },
      canManagePermissions,
      maxUploadBytes: MAX_UPLOAD_SIZE_BYTES,
      quotaBytes: getMediaConfig().storageQuotaBytes ?? null,
    };
  }

  @Get("/folders/:folderId/assets")
  async listAssets(@Parameter("folderId", "param") folderId: string) {
    const query = assertValidation(this.readQuery(), (v) =>
      listingQuerySchema.parse(v),
    );
    const context = await this.resolveContext();
    requireFolderRight(context, folderId, "read");
    const [assets, starred] = await Promise.all([
      loadAssetsInFolders(context.assetModel, [folderId]),
      loadStarredTargets(this.owner(context)),
    ]);
    return this.answerPage(context, assets, query, starred.assetIds);
  }

  @Get("/views/:view")
  async smartView(@Parameter("view", "param") view: string) {
    const smartView = assertValidation(view, (v) => smartViewSchema.parse(v));
    const query = assertValidation(this.readQuery(), (v) =>
      listingQuerySchema.parse(v),
    );
    const context = await this.resolveContext();
    const [assets, starred] = await Promise.all([
      readableAssets(context),
      loadStarredTargets(this.owner(context)),
    ]);
    const matching = SMART_VIEW_FILTERS[smartView](assets, starred.assetIds);
    const viewQuery: ListingQuery =
      smartView === "recent" && !this.ctx.url.searchParams.has("sort")
        ? { ...query, sort: "date", direction: "desc" }
        : query;
    const page = this.answerPage(
      context,
      matching,
      viewQuery,
      starred.assetIds,
    );
    const folders =
      smartView === "starred"
        ? context.folders
            .filter(
              (folder) =>
                starred.folderIds.has(folder._id) &&
                context.access.readable.has(folder._id),
            )
            .map((folder) =>
              buildFolderDto(context, folder, {
                starredIds: starred.folderIds,
              }),
            )
        : [];
    return { ...page, folders };
  }

  @Get("/search")
  async search() {
    const query = assertValidation(this.readQuery(), (v) =>
      searchQuerySchema.parse(v),
    );
    const context = await this.resolveContext();
    const scope = searchScope(context, query.folderId);
    const [assets, starred] = await Promise.all([
      loadAssetsInFolders(context.assetModel, scope),
      loadStarredTargets(this.owner(context)),
    ]);
    const hits = searchAssets(assets, {
      query,
      now: new Date(),
      visibilityOf: (asset) =>
        resolveEffectiveVisibility(
          asset,
          context.foldersById.get(asset.folderId),
        ),
    });
    const matchedOn = new Map(
      hits.map((hit) => [hit.asset._id, hit.matchedOn]),
    );
    const page = this.answerPage(
      context,
      hits.map((hit) => hit.asset),
      query,
      starred.assetIds,
    );
    const scopedFolders = context.folders.filter((folder) =>
      scope.includes(folder._id),
    );
    return {
      ...page,
      assets: page.assets.map((asset) => ({
        ...asset,
        matchedOn: matchedOn.get(asset.id) ?? "name",
      })),
      folders: searchFolders(scopedFolders, query.q).map((folder) =>
        buildFolderDto(context, folder, { starredIds: starred.folderIds }),
      ),
    };
  }

  @Get("/assets/:assetId/details")
  async details(@Parameter("assetId", "param") assetId: string) {
    const context = await this.resolveContext();
    const asset = await requireReadableAsset(context, assetId);
    const folder = requireVisibleFolder(context, asset.folderId);
    const [starred, uploader] = await Promise.all([
      loadStarredTargets(this.owner(context)),
      GetModel(UserModel).get(asset.createdBy),
    ]);
    const dto = buildAssetDto(context, asset, starred.assetIds);
    return {
      asset: dto,
      folder: buildFolderDto(context, folder, {
        starredIds: starred.folderIds,
      }),
      path: [...folder.path, folder._id]
        .map((id) => context.foldersById.get(id))
        .filter((entry) => entry !== undefined)
        .map((entry) => ({ id: entry._id, name: entry.name })),
      uploadedBy: uploader ? uploader.name || uploader.email : null,
      presets: isDescribableImage(asset.mimetype)
        ? [...getMediaConfig().presets.values()].map((preset) => ({
            id: preset.id,
            width: preset.width ?? null,
            height: preset.height ?? null,
            url: `/media/${asset._id}/${preset.id}/${encodeURIComponent(asset.name)}`,
          }))
        : [],
    };
  }

  @Post("/favorites")
  async favorite(@JSONBody() body: unknown) {
    const { kind, targetId, starred } = assertValidation(body, (v) =>
      favoriteSchema.parse(v),
    );
    const context = await this.resolveContext();
    if (kind === "folder") requireFolderRight(context, targetId, "read");
    if (kind === "asset") {
      const asset = await context.assetModel.get(targetId);
      assert(
        asset && context.access.readable.has(asset.folderId),
        404,
        "Asset not found",
      );
    }
    await setStarred(this.owner(context), kind, targetId, starred);
    return { ok: true };
  }

  @Get("/folders/:folderId/impact")
  async impact(@Parameter("folderId", "param") folderId: string) {
    const context = await this.resolveContext();
    const folder = requireVisibleFolder(context, folderId);
    const subfolders = getDescendantFolders(context, folderId);
    const folderIds = [folder._id, ...subfolders.map((child) => child._id)];
    const assets = await loadAssetsInFolders(context.assetModel, folderIds);
    const publicFiles = assets.filter(
      (asset) =>
        resolveEffectiveVisibility(
          asset,
          context.foldersById.get(asset.folderId),
        ) === "public",
    ).length;
    return {
      subfolders: subfolders.length,
      files: assets.length,
      size: assets.reduce((total, asset) => total + asset.size, 0),
      publicFiles,
      linkedSubfolders: subfolders.filter((child) => Boolean(child.binding))
        .length,
    };
  }

  @Post("/folders/starter")
  async createStarterFolders(@JSONBody() body: unknown) {
    const { folders } = assertValidation(body, (v) =>
      starterFoldersSchema.parse(v),
    );
    const context = await this.resolveContext();
    assert(
      context.rootRights.has("manage"),
      HTTP_FORBIDDEN,
      "Missing 'manage' right at the media root",
    );
    const rootNames = new Set(
      context.folders
        .filter((folder) => !folder.parentId)
        .map((folder) => folder.name),
    );
    assert(
      folders.every((folder) => !rootNames.has(folder.name)),
      HTTP_CONFLICT,
      "A root folder already has this name",
    );
    const ids = await context.folderModel.insert(
      folders.map((folder) => ({
        name: folder.name,
        path: [],
        visibility: folder.visibility,
      })),
    );
    return { ids };
  }

  private answerPage(
    context: MediaRequestContext,
    assets: MediaAsset[],
    query: ListingQuery,
    starredIds: Set<string>,
  ) {
    const page = pageAssets(assets, query);
    return {
      assets: page.assets.map((asset) =>
        buildAssetDto(context, asset, starredIds),
      ),
      total: page.total,
      facets: { all: assets.length, ...countByTypeGroup(assets) },
    };
  }
}
