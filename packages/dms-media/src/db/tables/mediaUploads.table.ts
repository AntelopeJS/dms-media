import {
  CreationTime,
  Field,
  Index,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { TENANT_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";

export const MEDIA_UPLOADS_TABLE_NAME = "media_uploads";

/** A presigned upload still in staging, until it is confirmed or purged. */
@RegisterTable(MEDIA_UPLOADS_TABLE_NAME, TENANT_SCHEMA_NAME)
export class MediaUpload extends Table {
  @Field("string")
  declare _id: string;

  @Index()
  @CreationTime()
  @Field("date")
  declare createdAt: Date;

  @Index()
  @Field("string")
  declare resourceKey: string;

  @Field("string")
  declare storage?: string;
}
