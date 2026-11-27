import { Get, JSONBody, Parameter, Post } from "@antelopejs/interface-api";
import { assert, assertValidation } from "@antelopejs/interface-api-util";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { getMediaConfig } from "../../config";
import type { MediaFolder } from "../../db";
import type { FolderVisibility } from "../../types";
import {
  type AssetPredicate,
  assetFilterPredicates,
} from "../../library/asset-filters";
import {
  loadStarredTargets,
  setStarred,
  type StarredTargets,
} from "../../library/favorites";
import {
  countLiveAssets,
  countPublicFiles,
  type FolderCounts,
  loadFolderCounts,
  subsetRows,
  sumFiles,
  sumSize,
} from "../../library/asset-totals";
import { computeFolderStats } from "../../library/folder-stats";
import {
  type AssetPage,
  type AssetSortFields,
  countByTypeGroup,
  countMimetypes,
  countTypeGroups,
  loadAssetsById,
  loadSortFields,
  pageAssets,
  typeGroupPredicate,
} from "../../library/listing";
import { searchAssets, searchFolders, searchWords } from "../../library/search";
import {
  newestFirst,
  SMART_VIEW_DEFAULT_SORTS,
  SMART_VIEWS,
} from "../../library/smart-views";
import {
  favoriteSchema,
  type AssetFilterQuery,
  listingQuerySchema,
  type PageQuery,
  searchQuerySchema,
  smartViewSchema,
  starterFoldersSchema,
} from "../../validation/library.schema";
import { MAX_UPLOAD_SIZE_BYTES } from "../../validation/media.schema";
import { requireReadableAsset } from "./assets";
import { MediaApiController } from "./controller";
import {
  getDescendantFolders,
  isMediaOwner,
  type MediaRequestContext,
  requireFolderRight,
  requireVisibleFolder,
} from "./context";
import {
  buildAssetDto,
  buildFolderDto,
  isFolderVisible,
  listVisibleFolders,
} from "./dto";

const HTTP_FORBIDDEN = 403;
const HTTP_CONFLICT = 409;
/** What a search without any word answers: nothing, rather than the whole library. */
const EMPTY_SEARCH = { assets: [], total: 0, facets: { all: 0 }, folders: [] };

function folderPathName(
  context: MediaRequestContext,
  folder: MediaFolder | undefined,
): string {
  if (!folder) return "";
  return [...folder.path, folder._id]
    .map((id) => context.foldersById.get(id)?.name ?? "")
    .join(" ");
}

function folderVisibilities(
  context: MediaRequestContext,
  folderIds: string[],
): Map<string, FolderVisibility> {
  return new Map(
    folderIds.map((id) => [
      id,
      context.foldersById.get(id)?.visibility ?? "private",
    ]),
  );
}

function filterPredicates(
  context: MediaRequestContext,
  folderIds: string[],
  query: AssetFilterQuery,
): AssetPredicate[] {
  return assetFilterPredicates({
    query,
    now: new Date(),
    folderVisibilities: folderVisibilities(context, folderIds),
  });
}

/** Folder DTOs with counts over every live asset of `scope`. */
async function buildFolderDtos(
  context: MediaRequestContext,
  folders: MediaFolder[],
  scope: string[],
  starredIds: Set<string>,
) {
  if (folders.length === 0) return [];
  const counts = await loadFolderCounts(context.assetModel, scope);
  const stats = computeFolderStats(context.folders, counts.all);
  return folders.map((folder) =>
    buildFolderDto(context, folder, {
      stats: stats.get(folder._id),
      starredIds,
    }),
  );
}

/** The folders a picker bound to `folderId` counts its smart views over, when the caller can read it. */
function treeViewScope(
  context: MediaRequestContext,
  folderId: string | undefined,
): Set<string> | undefined {
  if (!folderId || !context.access.readable.has(folderId)) return undefined;
  return new Set(searchScope(context, folderId));
}

async function countViews(
  context: MediaRequestContext,
  counts: FolderCounts,
  starred: StarredTargets,
  scope: Set<string> | undefined,
) {
  const inScope = (folderId: string) => !scope || scope.has(folderId);
  const starredFolders = [...starred.folderIds].filter(inScope).length;
  const starredFiles = await countLiveAssets(
    context.assetModel,
    [...starred.assetIds],
    [...(scope ?? context.access.readable)],
  );
  return {
    starred: starredFiles + starredFolders,
    missingAlt: sumFiles(
      subsetRows(counts, "missingAlt").filter((row) => inScope(row.folderId)),
    ),
  };
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

/** What the library takes at all: every client checks an upload against it before sending. */
function uploadLimits() {
  return {
    maxUploadBytes: MAX_UPLOAD_SIZE_BYTES,
    allowedMimetypes: [...getMediaConfig().allowedMimetypes],
  };
}

export class MediaLibraryController extends MediaApiController {
  private owner(context: MediaRequestContext) {
    return { tenantId: context.tenantId, userId: context.user._id };
  }

  @Get("/tree")
  async tree() {
    const context = await this.resolveContext();
    const [counts, starred] = await Promise.all([
      loadFolderCounts(
        context.assetModel,
        [...context.access.readable],
        ["missingAlt"],
      ),
      loadStarredTargets(this.owner(context)),
    ]);
    const stats = computeFolderStats(context.folders, counts.all);
    return {
      folders: listVisibleFolders(context, stats, starred.folderIds),
      root: {
        write: context.rootRights.has("write"),
        manage: context.rootRights.has("manage"),
        fileCount: sumFiles(counts.all),
        size: sumSize(counts.all),
      },
      views: await countViews(
        context,
        counts,
        starred,
        treeViewScope(context, this.readQuery().folderId),
      ),
      isOwner: isMediaOwner(context),
      ...uploadLimits(),
      quotaBytes: getMediaConfig().storageQuotaBytes ?? null,
    };
  }

  /** The folder a field binding created, without the whole tree: what an asset field needs to upload and pick. */
  @Get("/bindings/:bindingId/folder")
  async boundFolder(@Parameter("bindingId", "param") bindingId: string) {
    const context = await this.resolveContext();
    const folder = context.folders.find((entry) => entry.binding === bindingId);
    return {
      folder:
        folder && isFolderVisible(context, folder)
          ? buildFolderDto(context, folder)
          : null,
      ...uploadLimits(),
    };
  }

  @Get("/folders/:folderId/assets")
  async listAssets(@Parameter("folderId", "param") folderId: string) {
    const query = assertValidation(this.readQuery(), (v) =>
      listingQuerySchema.parse(v),
    );
    const context = await this.resolveContext();
    requireFolderRight(context, folderId, "read");
    const scope = [folderId];
    const starred = await loadStarredTargets(this.owner(context));
    return this.answerQuery(
      context,
      scope,
      filterPredicates(context, scope, query),
      query,
      starred.assetIds,
    );
  }

  @Get("/views/:view")
  async smartView(@Parameter("view", "param") view: string) {
    const smartView = assertValidation(view, (v) => smartViewSchema.parse(v));
    const query = assertValidation(this.readQuery(), (v) =>
      listingQuerySchema.parse(v),
    );
    const context = await this.resolveContext();
    const scope = searchScope(context, query.folderId);
    const starred = await loadStarredTargets(this.owner(context));
    const viewQuery = SMART_VIEWS[smartView]({
      starredAssetIds: starred.assetIds,
      folderVisibilities: folderVisibilities(context, scope),
    });
    const where = [
      ...filterPredicates(context, scope, query),
      ...viewQuery.where,
    ];
    const defaultSort = this.ctx.url.searchParams.has("sort")
      ? undefined
      : SMART_VIEW_DEFAULT_SORTS[smartView];
    const pageQuery = { ...query, ...defaultSort };
    const page = viewQuery.newest
      ? await this.answerRows(
          context,
          newestFirst(
            await loadSortFields(context.assetModel, scope, where),
          ).slice(0, viewQuery.newest),
          pageQuery,
          starred.assetIds,
        )
      : await this.answerQuery(
          context,
          scope,
          where,
          pageQuery,
          starred.assetIds,
        );
    const viewFolders = context.folders.filter(
      (folder) =>
        smartView === "starred" &&
        starred.folderIds.has(folder._id) &&
        scope.includes(folder._id),
    );
    return {
      ...page,
      folders: await buildFolderDtos(
        context,
        viewFolders,
        scope,
        starred.folderIds,
      ),
    };
  }

  @Get("/search")
  async search() {
    const query = assertValidation(this.readQuery(), (v) =>
      searchQuerySchema.parse(v),
    );
    if (searchWords(query.q).length === 0) return EMPTY_SEARCH;
    const context = await this.resolveContext();
    const scope = searchScope(context, query.folderId);
    const [rows, starred] = await Promise.all([
      loadSortFields(
        context.assetModel,
        scope,
        filterPredicates(context, scope, query),
      ),
      loadStarredTargets(this.owner(context)),
    ]);
    const hits = searchAssets(rows, query.q, (row) =>
      folderPathName(context, context.foldersById.get(row.folderId)),
    );
    const matchedOn = new Map(
      hits.map((hit) => [hit.asset._id, hit.matchedOn]),
    );
    const page = await this.answerRows(
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
      folders: await buildFolderDtos(
        context,
        searchFolders(scopedFolders, query.q),
        scope,
        starred.folderIds,
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
        "$dms_media.refusals.asset_not_found",
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
    const counts = await loadFolderCounts(context.assetModel, folderIds, [
      "ownPublic",
      "inherited",
    ]);
    return {
      subfolders: subfolders.length,
      files: sumFiles(counts.all),
      size: sumSize(counts.all),
      publicFiles: countPublicFiles(
        subsetRows(counts, "ownPublic"),
        subsetRows(counts, "inherited"),
        context.foldersById,
      ),
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
      "$dms_media.refusals.manage_root_denied",
    );
    const rootNames = new Set(
      context.folders
        .filter((folder) => !folder.parentId)
        .map((folder) => folder.name),
    );
    assert(
      folders.every((folder) => !rootNames.has(folder.name)),
      HTTP_CONFLICT,
      "$dms_media.refusals.root_name_taken",
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

  /** One page of the assets meeting `where`, with its facets counted in the database. */
  private async answerQuery(
    context: MediaRequestContext,
    scope: string[],
    where: AssetPredicate[],
    query: PageQuery,
    starredIds: Set<string>,
  ) {
    const model = context.assetModel;
    const type = query.type;
    const mimetypes = countMimetypes(model, scope, where);
    const rows = type
      ? mimetypes.then((counts) =>
          loadSortFields(model, scope, [
            ...where,
            typeGroupPredicate(type, counts.keys()),
          ]),
        )
      : loadSortFields(model, scope, where);
    const [counts, sortFields] = await Promise.all([mimetypes, rows]);
    const all = [...counts.values()].reduce((sum, count) => sum + count, 0);
    return this.answerPage(context, pageAssets(sortFields, query), starredIds, {
      all,
      ...countTypeGroups(counts),
    });
  }

  /** One page of `rows`, with its facets counted over them. */
  private async answerRows(
    context: MediaRequestContext,
    rows: AssetSortFields[],
    query: PageQuery,
    starredIds: Set<string>,
  ) {
    return this.answerPage(context, pageAssets(rows, query), starredIds, {
      all: rows.length,
      ...countByTypeGroup(rows),
    });
  }

  private async answerPage<F>(
    context: MediaRequestContext,
    page: AssetPage<AssetSortFields>,
    starredIds: Set<string>,
    facets: F,
  ) {
    const assets = await loadAssetsById(
      context.assetModel,
      page.assets.map((asset) => asset._id),
    );
    return {
      assets: assets.map((asset) => buildAssetDto(context, asset, starredIds)),
      total: page.total,
      facets,
    };
  }
}
