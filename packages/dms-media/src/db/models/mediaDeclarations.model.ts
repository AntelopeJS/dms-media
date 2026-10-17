import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import {
  MEDIA_DECLARATIONS_TABLE_NAME,
  MediaDeclaration,
  type MediaDeclarationKind,
} from "../tables";

export class MediaDeclarationModel extends BasicDataModel(
  MediaDeclaration,
  MEDIA_DECLARATIONS_TABLE_NAME,
) {
  async findByKey(
    kind: MediaDeclarationKind,
    key: string,
  ): Promise<MediaDeclaration | undefined> {
    const rows = await this.getBy("key", key);
    return rows.find((row) => row.kind === kind);
  }
}
