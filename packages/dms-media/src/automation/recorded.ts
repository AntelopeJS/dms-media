import { GetModel } from "@antelopejs/interface-database-decorators";
import { feedingBinding } from "../bindings";
import { type MediaFolder, MediaFolderModel } from "../db";
import {
  AUTOMATION_AUTHOR,
  DECLARED_CONTENT_AUTHOR,
} from "../declared/records";
import type { RecordedMediaEvent } from "../library/events";
import type { AutomationOriginFields } from "./origin";

export type { RecordedMediaEvent } from "../library/events";

export type ActorKind = "member" | "declared" | "automation";

const ACTOR_KINDS_BY_AUTHOR = new Map<string, ActorKind>([
  [DECLARED_CONTENT_AUTHOR._id, "declared"],
  [AUTOMATION_AUTHOR._id, "automation"],
]);

function actorKindOf(event: RecordedMediaEvent): ActorKind {
  return ACTOR_KINDS_BY_AUTHOR.get(event.actor.user._id) ?? "member";
}

/** The fields every media trigger payload carries. */
export type CommonFields = AutomationOriginFields & {
  tenantId: string;
  deliveryId: string;
  actorId: string;
  actorName: string;
  actorKind: ActorKind;
  at: string;
};

/** The fields every media trigger payload starts with; the channel adds the origin. */
export function commonFields(
  event: RecordedMediaEvent,
  deliveryId: string,
): CommonFields {
  return {
    tenantId: event.actor.tenantId,
    deliveryId,
    actorId: event.actor.user._id,
    actorName: event.actor.user.name || event.actor.user.email,
    actorKind: actorKindOf(event),
    at: event.at.toISOString(),
  };
}

/** Where a folder sits: its names and ids from the root, and the binding it feeds. */
export interface FolderPlace {
  folderId: string;
  folderName: string;
  folderPath: string;
  folderPathIds: string[];
  binding: string | null;
}

/**
 * The tenant's folders as the write saw them, else read once from the
 * database when a trigger first needs them.
 */
export class FolderLookup {
  private loaded?: Promise<ReadonlyMap<string, MediaFolder>>;

  constructor(
    private readonly tenantId: string,
    private readonly known?: ReadonlyMap<string, MediaFolder>,
  ) {}

  folders(): Promise<ReadonlyMap<string, MediaFolder>> {
    if (this.known) return Promise.resolve(this.known);
    this.loaded ??= GetModel(MediaFolderModel, this.tenantId)
      .getAll()
      .then((rows) => new Map(rows.map((row) => [row._id, row])));
    return this.loaded;
  }

  async get(folderId: string | undefined): Promise<MediaFolder | undefined> {
    if (!folderId) return undefined;
    return (await this.folders()).get(folderId);
  }

  async place(folderId: string): Promise<FolderPlace> {
    const foldersById = await this.folders();
    const folder = foldersById.get(folderId);
    const pathIds = [...(folder?.path ?? []), folderId];
    return {
      folderId,
      folderName: folder?.name ?? "",
      folderPath: pathIds
        .map((id) => foldersById.get(id)?.name ?? "")
        .join("/"),
      folderPathIds: pathIds,
      binding: feedingBinding(folder, foldersById) ?? null,
    };
  }
}
