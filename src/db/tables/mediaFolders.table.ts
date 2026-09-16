import {
  CreationTime,
  Field,
  Index,
  RegisterTable,
  Table,
  UpdateTime,
} from "@antelopejs/interface-database-decorators";
import { TENANT_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import type { FolderVisibility } from "../../types";

export const MEDIA_FOLDERS_TABLE_NAME = "media_folders";

@RegisterTable(MEDIA_FOLDERS_TABLE_NAME, TENANT_SCHEMA_NAME)
export class MediaFolder extends Table {
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
  declare name: string;

  @Index()
  @Field("string")
  declare parentId?: string;

  /** Materialized ids of every ancestor, root first. */
  @Field(["string"])
  declare path: string[];

  /** JSON-serialized AclEntry[]; absent means the folder inherits its parent ACL. */
  @Field("string")
  declare json_acl?: string;

  /** Consumer id owning this linked folder; also the provisioning idempotency key. */
  @Index()
  @Field("string")
  declare binding?: string;

  @Field("string")
  declare visibility: FolderVisibility;
}
