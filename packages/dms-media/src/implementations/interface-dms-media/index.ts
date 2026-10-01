import type { AssetBindingConfig } from "@antelopejs/interface-dms-media";
import { addAssetBinding, removeAssetBinding } from "../../bindings";

export namespace internal {
  export const RegisterAssetBinding = {
    register: (id: string, config: AssetBindingConfig): void => {
      addAssetBinding(id, config);
    },
    unregister: (id: string): void => {
      removeAssetBinding(id);
    },
  };
}
