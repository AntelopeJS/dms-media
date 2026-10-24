import type { AclEntry } from "./acl";
import { internal } from "./internal";

/** Who may open a folder's files without a session: `public` serves them to anyone. */
export type MediaFolderVisibility = "private" | "public";

/**
 * A folder the calling project ships as code. It is keyed by `key`: declaring
 * the same key again never creates a second folder.
 */
export interface MediaFolderDeclaration {
  /** Stable key chosen by the caller and namespaced, such as `helio.procedures`. */
  key: string;
  name: string;
  /**
   * Where the folder goes: another declared folder, by its key (or `{ key }`),
   * or the folder linked to an asset field (`{ binding }`) when that binding
   * allows `subfolders`. Absent places the folder at the library root.
   */
  parent?: string | MediaFolderTarget;
  /** Defaults to `private`. */
  visibility?: MediaFolderVisibility;
  /** The folder's own ACL; absent inherits the parent's, or the root ACL at the root. */
  acl?: AclEntry[];
  /** Explicit existing workspace; required and nonblank. Does not establish authorization or provisioning completion. */
  tenantId: string;
}

/** A folder declared with `EnsureMediaFolder`, by its key. */
export interface DeclaredFolderTarget {
  key: string;
}

/** The folder bound to an asset field, by the binding id given to `AssetType` or `RegisterAssetBinding`. */
export interface BoundFolderTarget {
  binding: string;
}

export type MediaFolderTarget = DeclaredFolderTarget | BoundFolderTarget;

/** File content held in memory. */
export interface MediaBytesSource {
  bytes: Uint8Array;
}

/** File content read from a path on the backend's file system. */
export interface MediaFileSource {
  filePath: string;
}

/**
 * File content produced on demand, such as a generated image: the media
 * module calls `load` only when it creates the file.
 */
export interface MediaLazySource {
  load: () => Uint8Array | Promise<Uint8Array>;
}

export type MediaAssetSource =
  | MediaBytesSource
  | MediaFileSource
  | MediaLazySource;

/**
 * A file the calling project ships as code. It is keyed by `key`: importing
 * the same key again never uploads a second copy.
 */
export interface MediaAssetDeclaration {
  /** Stable key chosen by the caller and namespaced, such as `helio.procedures.safety`. */
  key: string;
  folder: MediaFolderTarget;
  /** File name shown in the library, extension included. */
  name: string;
  mimetype: string;
  source: MediaAssetSource;
  alt?: string;
  /** Explicit existing workspace; required and nonblank. Does not establish authorization or provisioning completion. */
  tenantId: string;
}

/**
 * What a declaration did. Declared content is written once, when the tenant
 * is provisioned:
 * - `created`: the folder or file was not declared yet, and was created;
 * - `kept`: it was declared before, and was left as it is.
 */
export type MediaDeclarationStatus = "created" | "kept";

export interface MediaDeclarationResult {
  status: MediaDeclarationStatus;
  /** Library id of the folder or file the declaration created. */
  id: string;
}

/**
 * Creates a folder of the media library from backend code, once per key and
 * tenant. Call it from `Hook.TENANT_BEING_PROVISIONED`: the folder is written
 * when the tenant is created and belongs to its members from then on, so a
 * later declaration of the same key leaves it as it is.
 *
 * Requires an explicit, nonblank tenantId, validated before database or storage
 * effects. Trusted backend callers must authorize the tenant themselves.
 */
export function EnsureMediaFolder(
  declaration: MediaFolderDeclaration,
): Promise<MediaDeclarationResult> {
  return internal.EnsureMediaFolder(declaration);
}

/**
 * Adds a file to the media library from backend code, once per key and
 * tenant: the media module writes the bytes to its file storage, computes the
 * image dimensions and records the upload in the library activity. Call it
 * from `Hook.TENANT_BEING_PROVISIONED`, like `EnsureMediaFolder`: a later
 * declaration of the same key leaves the file as it is, without reading the
 * source.
 *
 * Requires an explicit, nonblank tenantId before reading the source or writing.
 * It does not authorize the tenant.
 */
export function ImportMediaAsset(
  declaration: MediaAssetDeclaration,
): Promise<MediaDeclarationResult> {
  return internal.ImportMediaAsset(declaration);
}
