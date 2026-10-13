/** Root of the block names and descriptions shown in the Roles editor. */
export const BLOCK_TEXTS = "$dms_media.blocks";

export interface BlockMeta {
  name: string;
  description: string;
  icon: string;
}

/** Translated name, description and icon of a block, for its permission. */
export function blockMeta(id: string, icon: string): BlockMeta {
  return {
    name: `${BLOCK_TEXTS}.${id}.name`,
    description: `${BLOCK_TEXTS}.${id}.description`,
    icon,
  };
}
