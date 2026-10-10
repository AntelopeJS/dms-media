import {
  CreationTime,
  Field,
  Index,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { TENANT_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";

export const MEDIA_FAVORITES_TABLE_NAME = "media_favorites";

export type MediaFavoriteKind = "asset" | "folder";

/** A file or folder a member starred. */
@RegisterTable(MEDIA_FAVORITES_TABLE_NAME, TENANT_SCHEMA_NAME)
export class MediaFavorite extends Table {
  @Field("string")
  declare _id: string;

  @CreationTime()
  @Field("date")
  declare createdAt: Date;

  @Index()
  @Field("string")
  declare userId: string;

  @Field("string")
  declare kind: MediaFavoriteKind;

  @Index()
  @Field("string")
  declare targetId: string;
}
