import {
  ComponentBuilder,
  type ComponentInfoSerialized,
} from "@antelopejs/interface-dms/component";
import {
  DataType,
  RegisterDataType,
} from "@antelopejs/interface-dms/base/data-types";
import { z } from "zod";
import { type AssetBindingConfig, RegisterAssetBinding } from "./bindings";

/** Id of the data type `AssetType` registers. */
export const ASSET_DATA_TYPE_ID = "asset";
/** Frontend component the implementer renders as the asset field widget. */
export const ASSET_PICKER_COMPONENT = "dms-media-asset-picker";

export interface AssetTypeOptions extends Record<string, unknown> {
  multiple?: boolean;
  max?: number;
  mimetypes?: string[];
  /** Folder the field's uploads land in, registered with `RegisterAssetBinding`. */
  binding?: AssetBindingConfig;
}

export interface AssetPickerComponentOptions {
  multiple?: boolean;
  max?: number;
  mimetypes?: string[];
  bindingId?: string;
}

/**
 * Form field referencing media library assets by id: one id, or an array of
 * ids when `multiple` is set.
 */
@RegisterDataType(ASSET_DATA_TYPE_ID)
export class AssetType extends DataType {
  constructor(public readonly options: AssetTypeOptions = {}) {
    super([], undefined, options);
    if (options.binding) {
      RegisterAssetBinding({
        ...options.binding,
        field: {
          multiple: options.multiple,
          max: options.max,
          mimetypes: options.mimetypes,
        },
      });
    }
  }

  protected defaultInputComponent(): ComponentInfoSerialized {
    return new ComponentBuilder<AssetPickerComponentOptions>(
      ASSET_PICKER_COMPONENT,
    )
      .options({
        multiple: this.options.multiple,
        max: this.options.max,
        mimetypes: this.options.mimetypes,
        bindingId: this.options.binding?.id,
      })
      .serializeSync();
  }

  getValidation(): z.ZodType {
    const idSchema = z.string().min(1);
    if (!this.options.multiple) {
      return idSchema;
    }
    if (this.options.max !== undefined) {
      return z.array(idSchema).max(this.options.max);
    }
    return z.array(idSchema);
  }
}
