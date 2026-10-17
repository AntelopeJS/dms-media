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
 * A folder or file a module declared as code, by the key it chose: what it
 * last declared, and the state it left the row in, to tell a member's change
 * from content still as declared.
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

  /** Hash of the last declaration applied. */
  @Field("string")
  declare declaredHash: string;

  /** Hash of the row's member-editable state right after that declaration was applied. */
  @Field("string")
  declare appliedHash: string;

  /** Hash of the declared file's bytes; absent for a folder. */
  @Field("string")
  declare contentHash?: string;
}
