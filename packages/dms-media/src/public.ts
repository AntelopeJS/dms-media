/**
 * What `import ... from "@antelopejs/dms-media"` resolves to, through the
 * package `exports` map. The AntelopeJS module entry is `main`
 * (`dist/index.js`), which only the runtime loads.
 *
 * This file re-exports `@antelopejs/interface-dms-media` and nothing of the
 * module itself, so a consumer importing it gets the shared interface and
 * never evaluates the module's pages, permissions or routes under its own
 * context. Each name is re-exported individually so editors flag it as
 * deprecated at the import site.
 *
 * @packageDocumentation
 */
export {
  /** @deprecated Import it from `@antelopejs/interface-dms-media`. */
  ASSET_DATA_TYPE_ID,
  /** @deprecated Import it from `@antelopejs/interface-dms-media`. */
  ASSET_PICKER_COMPONENT,
  /** @deprecated Import it from `@antelopejs/interface-dms-media`. */
  AssetType,
  /** @deprecated Import it from `@antelopejs/interface-dms-media`. */
  RegisterAssetBinding,
  /** @deprecated Import it from `@antelopejs/interface-dms-media`. */
  UnregisterAssetBinding,
} from "@antelopejs/interface-dms-media";
export type {
  /** @deprecated Import it from `@antelopejs/interface-dms-media`. */
  AclEntry,
  /** @deprecated Import it from `@antelopejs/interface-dms-media`. */
  AclRight,
  /** @deprecated Import it from `@antelopejs/interface-dms-media`. */
  AclSubject,
  /** @deprecated Import it from `@antelopejs/interface-dms-media`. */
  AclSubjectKind,
  /** @deprecated Import it from `@antelopejs/interface-dms-media`. */
  AssetBindingConfig,
  /** @deprecated Import it from `@antelopejs/interface-dms-media`. */
  AssetPermissionMapping,
  /** @deprecated Import it from `@antelopejs/interface-dms-media`. */
  AssetPickerComponentOptions,
  /** @deprecated Import it from `@antelopejs/interface-dms-media`. */
  AssetTypeOptions,
} from "@antelopejs/interface-dms-media";
