export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageTransformOps {
  crop?: CropRegion;
  rotate?: number;
}

const FULL_TURN = 360;
const QUARTER_TURN = 90;
const FULL_FRAME: CropRegion = { x: 0, y: 0, width: 1, height: 1 };

export function normalizeRotation(rotate: number | undefined): number {
  return (((rotate ?? 0) % FULL_TURN) + FULL_TURN) % FULL_TURN;
}

/** Where a normalized region lands once its frame turns a quarter clockwise. */
function rotateRegionQuarter(region: CropRegion): CropRegion {
  return {
    x: 1 - region.y - region.height,
    y: region.x,
    width: region.height,
    height: region.width,
  };
}

function rotateRegion(region: CropRegion, rotate: number): CropRegion {
  const quarters = normalizeRotation(rotate) / QUARTER_TURN;
  return Array.from({ length: quarters }).reduce<CropRegion>(
    (current) => rotateRegionQuarter(current),
    region,
  );
}

function nestRegion(outer: CropRegion, inner: CropRegion): CropRegion {
  return {
    x: outer.x + inner.x * outer.width,
    y: outer.y + inner.y * outer.height,
    width: inner.width * outer.width,
    height: inner.height * outer.height,
  };
}

function isFullFrame(region: CropRegion): boolean {
  return (
    region.x === FULL_FRAME.x &&
    region.y === FULL_FRAME.y &&
    region.width === FULL_FRAME.width &&
    region.height === FULL_FRAME.height
  );
}

/**
 * Folds new operations, expressed on the current (already edited) image,
 * into one rotation and one crop of the untouched original.
 */
export function composeTransforms(
  applied: ImageTransformOps,
  next: ImageTransformOps,
): ImageTransformOps {
  const turned = rotateRegion(applied.crop ?? FULL_FRAME, next.rotate ?? 0);
  const crop = nestRegion(turned, next.crop ?? FULL_FRAME);
  const rotate = normalizeRotation(
    normalizeRotation(applied.rotate) + normalizeRotation(next.rotate),
  );
  return {
    rotate: rotate || undefined,
    crop: isFullFrame(crop) ? undefined : crop,
  };
}

export function parseTransform(json: string | undefined): ImageTransformOps {
  if (!json) return {};
  // SAFETY: json_transform is written only as "" or the JSON.stringify of the cumulative ImageTransformOps (transform.ts), so a non-empty value is that object; a schema parse of a stored row on read is excluded by ruling.
  return JSON.parse(json) as ImageTransformOps;
}
