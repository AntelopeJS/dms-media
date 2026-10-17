import type { ControllerClass } from "@antelopejs/interface-api";
import type { AclEntry } from "./acl";
import { internal } from "./internal";

/** Permission ids granted `read` and `write` on a bound folder. */
export interface AssetPermissionMapping {
  read?: string[];
  write?: string[];
}

/**
 * A media folder linked to an asset field. The implementer provisions it under
 * the `Content` root of each tenant, keyed by `id`, with an ACL derived from
 * the mapping below.
 */
/** What the asset field bound to a folder accepts, as declared on `AssetType`. */
export interface AssetBindingField {
  multiple?: boolean;
  max?: number;
  mimetypes?: string[];
}

export interface AssetBindingConfig {
  id: string;
  folderName?: string;
  permissionMapping?: AssetPermissionMapping;
  /**
   * Page controller whose effective permission becomes the default read and
   * write mapping of the linked folder. Resolved lazily at provisioning time,
   * so the binding can reference the page class it is declared in. Explicit
   * `permissionMapping` entries take precedence per right: an explicit empty
   * array opts that right out of the page-derived fallback entirely.
   */
  permissionsFromPage?: ControllerClass;
  acl?: AclEntry[];
  /**
   * Lets the linked folder hold subfolders, such as one per record: owners
   * create them in the library, and backend code with `EnsureMediaFolder`
   * and `parent: { binding }`. The linked folder itself stays locked. Its
   * subfolders inherit its ACL unless given their own, and accept only the
   * types its field accepts. Defaults to false.
   */
  subfolders?: boolean;
  /** Filled by `AssetType`: what the field accepts, shown next to the folder. */
  field?: AssetBindingField;
}

/**
 * Declares a folder binding. The registration belongs to the calling module:
 * it is released when that module is destroyed and replayed to every new
 * generation of the implementer.
 */
export function RegisterAssetBinding(config: AssetBindingConfig): void {
  internal.RegisterAssetBinding.register(config.id, config);
}

/** Withdraws a folder binding. Folders already provisioned stay in place. */
export function UnregisterAssetBinding(id: string): void {
  internal.RegisterAssetBinding.unregister(id);
}
