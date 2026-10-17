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
 * module calls `load` only when it needs the bytes, to create the file or to
 * compare its content.
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
  /**
   * Opaque version of the content chosen by the caller, such as a hash of
   * what it is generated from. While it equals the version of the last
   * declaration of this key, the content counts as unchanged and `source` is
   * not read. Change it whenever the bytes change.
   */
  version?: string;
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
 * as the members made it. Content the code stops declaring stays until it is
 * retired with `RetireMediaDeclaration` or `PruneMediaDeclarations`.
 *
 * The source is read only when the bytes are needed: not for a file a member
 * changed or deleted, nor while `version` equals the last declared one.
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

/** What a declaration made: a folder (`EnsureMediaFolder`) or a file (`ImportMediaAsset`). */
export type MediaContentKind = "folder" | "asset";

/** A declaration the calling code no longer makes, by the kind and key it was made with. */
export interface MediaDeclarationRetirement {
  kind: MediaContentKind;
  key: string;
  /** Explicit existing workspace; required and nonblank. */
  tenantId: string;
}

/**
 * Retires every declaration under a namespace that the calling code no longer
 * makes: the keys starting with `prefix`, except those listed in `keep`.
 */
export interface MediaDeclarationPrune {
  /** Namespace of the caller's keys, such as `helio.`; required and nonblank. */
  prefix: string;
  /** Keys the code still declares, folders and files alike. */
  keep: string[];
  /** Explicit existing workspace; required and nonblank. */
  tenantId: string;
}

/**
 * What retiring a declaration did:
 * - `removed`: the folder or file still held what was last declared (and the
 *   folder was empty), so it was deleted from the library;
 * - `preserved`: someone changed it since it was last declared, or the folder
 *   holds other content, so it was left as is;
 * - `deleted`: someone had already deleted it;
 * - `unknown`: nothing is declared under this kind and key, never or no longer.
 *
 * Except for `unknown`, the declaration is forgotten: what stays in the
 * library belongs to the members, and declaring the key again creates new
 * content.
 */
export type MediaRetirementStatus =
  | "removed"
  | "preserved"
  | "deleted"
  | "unknown";

export interface MediaRetirementResult {
  kind: MediaContentKind;
  key: string;
  status: MediaRetirementStatus;
  /** Library id of the folder or file removed or left in place. */
  id?: string;
}

/**
 * Takes back a folder or file the calling code declared and no longer
 * declares. It is deleted only while it still holds exactly what was last
 * declared, and a folder only once empty: renamed, moved, re-shared, edited
 * or filled by members since, it stays in the library as theirs.
 *
 * Retire a folder's declared files and subfolders before the folder, or use
 * `PruneMediaDeclarations`, which does it in that order. Same trusted
 * backend context and readiness as `EnsureMediaFolder`.
 */
export function RetireMediaDeclaration(
  retirement: MediaDeclarationRetirement,
): Promise<MediaRetirementResult> {
  return internal.RetireMediaDeclaration(retirement);
}

/**
 * Retires, as `RetireMediaDeclaration` does, every declaration whose key
 * starts with `prefix` and is not in `keep`: files first, then folders from
 * the deepest. Call it after the declarations of the current code, with the
 * keys they used, to take back what a previous version shipped and this one
 * no longer does. Only one module should own a prefix.
 */
export function PruneMediaDeclarations(
  prune: MediaDeclarationPrune,
): Promise<MediaRetirementResult[]> {
  return internal.PruneMediaDeclarations(prune);
}
