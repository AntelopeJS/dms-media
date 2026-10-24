import {
  CreationTime,
  Field,
  Index,
  RegisterTable,
  Table,
  UpdateTime,
} from "@antelopejs/interface-database-decorators";
import { TENANT_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";

export const MEDIA_DECLARATIONS_TABLE_NAME = "media_declarations";

export type MediaDeclarationKind = "folder" | "asset";

/**
 * A folder or file a module declared as code, by the key it chose: what lets
 * a later declaration name it (a declared parent folder) and a repeated
 * declaration leave it as it is.
 */
@RegisterTable(MEDIA_DECLARATIONS_TABLE_NAME, TENANT_SCHEMA_NAME)
export class MediaDeclaration extends Table {
  @Field("string")
  declare _id: string;

  @CreationTime()
  @Field("date")
  declare createdAt: Date;

  @UpdateTime()
  @Field("date")
  declare updatedAt: Date;

  @Field("string")
  declare kind: MediaDeclarationKind;

  @Index()
  @Field("string")
  declare key: string;

  /** Id of the declared folder or asset row. */
  @Field("string")
  declare targetId: string;
}
