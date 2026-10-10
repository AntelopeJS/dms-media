import {
  CreationTime,
  Field,
  Index,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { TENANT_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";

export const MEDIA_EVENTS_TABLE_NAME = "media_events";

/** One entry of the library's activity: who changed what, and where. */
@RegisterTable(MEDIA_EVENTS_TABLE_NAME, TENANT_SCHEMA_NAME)
export class MediaEvent extends Table {
  @Field("string")
  declare _id: string;

  @Index()
  @CreationTime()
  @Field("date")
  declare createdAt: Date;

  @Field("string")
  declare kind: string;

  @Field("string")
  declare actorId: string;

  @Field("string")
  declare actorName: string;

  /** Folder the event happened in; absent at the library root. */
  @Index()
  @Field("string")
  declare folderId?: string;

  @Index()
  @Field("string")
  declare assetId?: string;

  /** File or folder name at the time of the event. */
  @Field("string")
  declare targetName: string;

  @Field("number")
  declare count?: number;

  @Field("number")
  declare size?: number;

  /** JSON-serialized Record<string, string | number> of kind-specific values. */
  @Field("string")
  declare json_details?: string;
}
