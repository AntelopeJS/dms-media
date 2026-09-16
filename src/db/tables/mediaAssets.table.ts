import {
  CreationTime,
  Field,
  Index,
  RegisterTable,
  Table,
  UpdateTime,
} from "@antelopejs/interface-database-decorators";
import { TENANT_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import type { AssetVisibility } from "../../types";

export const MEDIA_ASSETS_TABLE_NAME = "media_assets";

@RegisterTable(MEDIA_ASSETS_TABLE_NAME, TENANT_SCHEMA_NAME)
export class MediaAsset extends Table {
  @Field("string")
  declare _id: string;

  @Index()
  @CreationTime()
  @Field("date")
  declare createdAt: Date;

  @Index()
  @UpdateTime()
  @Field("date")
  declare updatedAt: Date;

  @Index()
  @Field("string")
  declare folderId: string;

  @Index()
  @Field("string")
  declare name: string;

  @Field("string")
  declare mimetype: string;

  @Field("number")
  declare size: number;

  @Field("string")
  declare storageKey: string;

  /** Named storage of interface-file-storage; absent means the default storage. */
  @Field("string")
  declare storage?: string;

  @Field("number")
  declare width?: number;

  @Field("number")
  declare height?: number;

  @Field("string")
  declare alt?: string;

  @Field("string")
  declare visibility: AssetVisibility;

  /** JSON-serialized Record<presetCacheKey, storageKey> of generated derivatives. */
  @Field("string")
  declare json_derivatives?: string;

  @Field("string")
  declare mediaRevision: string;

  /** JSON-serialized string[] of storage keys waiting for deletion. */
  @Field("string")
  declare json_retiredFiles: string;

  @Field("boolean")
  declare isDeleting?: boolean;

  /** Pre-edit storage key kept to allow reverting a destructive transform. */
  @Field("string")
  declare originalKey?: string;

  @Index()
  @Field("string")
  declare createdBy: string;
}
