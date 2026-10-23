import {
  InterfaceFunction,
  RegisteringProxy,
} from "@antelopejs/interface-core";
import type { AssetBindingConfig } from "./bindings";
import type {
  MediaAssetDeclaration,
  MediaDeclarationResult,
  MediaFolderDeclaration,
} from "./content";

/**
 * @internal
 */
export namespace internal {
  export const RegisterAssetBinding = new RegisteringProxy<
    (id: string, config: AssetBindingConfig) => void
  >();
  export const EnsureMediaFolder =
    InterfaceFunction<
      (declaration: MediaFolderDeclaration) => MediaDeclarationResult
    >();
  export const ImportMediaAsset =
    InterfaceFunction<
      (declaration: MediaAssetDeclaration) => MediaDeclarationResult
    >();
}
