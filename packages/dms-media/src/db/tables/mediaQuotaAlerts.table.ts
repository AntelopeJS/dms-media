import {
  CreationTime,
  Field,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { TENANT_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";

export const MEDIA_QUOTA_ALERTS_TABLE_NAME = "media_quota_alerts";

/**
 * A storage threshold the tenant's library crossed, kept until usage drops
 * back below it: `media.storage-threshold` fires once per row, cluster-wide.
 */
@RegisterTable(MEDIA_QUOTA_ALERTS_TABLE_NAME, TENANT_SCHEMA_NAME)
export class MediaQuotaAlert extends Table {
  @Field("string")
  declare _id: string;

  @CreationTime()
  @Field("date")
  declare createdAt: Date;

  @Field("number")
  declare percent: number;

  @Field("number")
  declare thresholdBytes: number;

  @Field("number")
  declare usedBytes: number;

  @Field("date")
  declare crossedAt: Date;
}
