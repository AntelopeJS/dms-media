import type { AclEntry } from "./acl";
import { internal } from "./internal";

/** Who may open a folder's files without a session: `public` serves them to anyone. */
export type MediaFolderVisibility = "private" | "public";

/**
 * A folder the calling project ships as code. It is keyed by `key`: declaring
 * the same key again, on every boot or hot reload, never creates a second
 * folder.
 */
export interface MediaFolderDeclaration {
  /** Stable key chosen by the caller and namespaced, such as `helio.procedures`. */
  key: string;
  name: string;
  /** Key of another declared folder; absent places the folder at the library root. */
  parent?: string;
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

export type MediaAssetSource = MediaBytesSource | MediaFileSource;

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
 * What a declaration did:
 * - `created`: the folder or file did not exist and was created;
 * - `updated`: it still held what was last declared, and was refreshed to the new declaration;
 * - `unchanged`: it already matches the declaration;
 * - `preserved`: someone changed it since it was last declared, so it was left as is;
 * - `deleted`: someone deleted it since it was declared, so it was not created again.
 */
export type MediaDeclarationStatus =
  | "created"
  | "updated"
  | "unchanged"
  | "preserved"
  | "deleted";

export interface MediaDeclarationResult {
  status: MediaDeclarationStatus;
  /** Library id of the folder or file; absent when it was `deleted`. */
  id?: string;
}

/**
 * Creates a folder of the media library from backend code, once per key and
 * tenant. A later declaration only refreshes the folder while it still holds
 * what was last declared: renamed, moved, re-shared or deleted in the library
 * since, it is left as the members made it.
 *
 * Requires an explicit, nonblank tenantId, validated before database or storage
 * effects. Trusted backend callers must authorize the tenant themselves.
 * Calls wait for media and database readiness, not SaaS provisioning completion.
 * Applications should initialize new SaaS tenants through their durable `created`
 * lifecycle consumer. `start()` is process-global, not per tenant. Do not await
 * this in `construct()`: the database needs every module to be constructed.
 */
export function EnsureMediaFolder(
  declaration: MediaFolderDeclaration,
): Promise<MediaDeclarationResult> {
  return internal.EnsureMediaFolder(declaration);
}

/**
 * Adds a file to the media library from backend code, once per key and
 * tenant: the media module writes the bytes to its file storage, computes the
 * image dimensions and records the upload in the library activity. A later
 * declaration only refreshes the file while it still holds what was last
 * declared: renamed, moved, edited or deleted in the library since, it is left
 * as the members made it.
 *
 * Requires an explicit, nonblank tenantId before reading the source or writing.
 * Uses the same trusted backend context and readiness as `EnsureMediaFolder`;
 * it does not authorize the tenant or establish SaaS provisioning completion.
 */
export function ImportMediaAsset(
  declaration: MediaAssetDeclaration,
): Promise<MediaDeclarationResult> {
  return internal.ImportMediaAsset(declaration);
}
