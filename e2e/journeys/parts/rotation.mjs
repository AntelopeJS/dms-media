import { createFolder, deliveryPath, folderAssets, follow, uploaded } from "../../library.mjs";
import { check, media, pick, sharpOf, text } from "../../media.mjs";
import { rotateOnce, settled } from "./editor-page.mjs";

/**
 * @typedef {import("../../media.mjs").Ctx} Ctx
 * @typedef {{ width: number, height: number, corners: string }} Seen
 */

/** The four quadrants of the test image, which no turn or mirror leaves where it was. */
const COLOURS = {
  red: [220, 30, 30],
  green: [30, 200, 30],
  blue: [30, 30, 220],
  yellow: [230, 220, 30],
};

/** The corners, clockwise from the top left, of the image as uploaded and after each turn. */
const UPRIGHT = "red green yellow blue";
const QUARTER_CLOCKWISE = "blue red green yellow";
const HALF_TURN = "yellow blue red green";
const QUARTER_COUNTER_CLOCKWISE = "green yellow blue red";

/**
 * A 400 × 200 PNG: red top left, green top right, yellow bottom right and blue bottom left.
 *
 * @returns {Promise<Buffer>} Its bytes
 */
async function quadrants() {
  const width = 400;
  const height = 200;
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const colour = y < height / 2 ? (x < width / 2 ? COLOURS.red : COLOURS.green) : x < width / 2 ? COLOURS.blue : COLOURS.yellow;
      pixels.set(colour, (y * width + x) * 3);
    }
  }
  return sharpOf()(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

/**
 * @param {number[]} rgb A pixel
 * @returns {string} The name of the quadrant colour it is closest to
 */
function nearest(rgb) {
  const distance = (/** @type {number[]} */ colour) => colour.reduce((sum, channel, index) => sum + Math.abs(channel - (rgb[index] ?? 0)), 0);
  return Object.entries(COLOURS).sort(([, left], [, right]) => distance(left) - distance(right))[0]?.[0] ?? "";
}

/**
 * What a delivery link serves: its size, and the colour at each corner, clockwise from the top left.
 *
 * @param {Ctx} ctx The journey
 * @param {string} path The delivery path, with the image size in it when it is not the file
 * @returns {Promise<Seen>} What it shows, with no corners when it was not served
 */
async function seen(ctx, path) {
  const delivered = await follow(ctx, path, { as: "admin" });
  if (!delivered.file || delivered.file.bytes.byteLength === 0) return { width: 0, height: 0, corners: "" };
  const { data, info } = await sharpOf()(delivered.file.bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const inset = 3;
  const at = (/** @type {number} */ x, /** @type {number} */ y) => nearest([...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)]);
  const right = info.width - 1 - inset;
  const bottom = info.height - 1 - inset;
  return { width: info.width, height: info.height, corners: [at(inset, inset), at(right, inset), at(right, bottom), at(inset, bottom)].join(" ") };
}

/**
 * The file and its two default sizes, as the delivery link serves them now.
 *
 * @param {Ctx} ctx The journey
 * @param {string} id The file
 * @param {string} name Its name
 * @returns {Promise<{ file: Seen, thumb: Seen, preview: Seen }>} What each shows
 */
async function allSizes(ctx, id, name) {
  return {
    file: await seen(ctx, `/media/${id}/${name}`),
    thumb: await seen(ctx, `/media/${id}/thumb/${name}`),
    preview: await seen(ctx, `/media/${id}/preview/${name}`),
  };
}

/**
 * @param {string} turn What was done
 * @param {{ file: Seen, thumb: Seen, preview: Seen }} shown What each size shows
 * @param {string} corners The corners every size must show
 * @param {{ width: number, height: number }} size The size of the file itself
 * @returns {import("../../media.mjs").Check[]} One check per size
 */
function showTurn(turn, shown, corners, size) {
  const portrait = size.height > size.width;
  return [
    check(`${turn}: the file is ${size.width} × ${size.height} with the corners ${corners}`, shown.file.width === size.width && shown.file.height === size.height && shown.file.corners === corners, shown.file),
    check(`${turn}: the thumb shows the same corners, ${portrait ? "portrait" : "landscape"}`, shown.thumb.corners === corners && (shown.thumb.height > shown.thumb.width) === portrait, shown.thumb),
    check(`${turn}: the preview shows the same corners at the file's size`, shown.preview.corners === corners && shown.preview.width === size.width && shown.preview.height === size.height, shown.preview),
  ];
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const aSavedRotationTurnsEverySizeClockwise = {
  id: "a-saved-rotation-turns-the-file-and-every-size-clockwise",
  title: "a rotation of 90° turns the image a quarter clockwise, its top left corner going to the top right, and the file, its thumb and its preview, all rendered before the save, show that turn after it; a second turn makes a half turn and Revert brings the first corners back, in every size",
  entryPoint: "POST /api/media/assets/:id/transform, /revert",
  async run(/** @type {Ctx} */ ctx) {
    const folder = await createFolder(ctx, ctx.unique("Quarter"));
    const file = await uploaded(ctx, { folderId: folder.id, name: "quartiers.png", mimetype: "image/png", bytes: await quadrants() });
    const before = await allSizes(ctx, file.id, "quartiers.png");
    await ctx.verify("the image before any edit", showTurn("as uploaded", before, UPRIGHT, { width: 400, height: 200 }));
    const quarter = await media(ctx, "rotate by 90°", "POST", `/assets/${file.id}/transform`, { body: { rotate: 90 } });
    const afterQuarter = await allSizes(ctx, file.id, "quartiers.png");
    await ctx.verify("a quarter turn clockwise", [
      check("the save is answered with the swapped size", quarter.status === 200 && pick(quarter.body, "asset", "width") === 200 && pick(quarter.body, "asset", "height") === 400, quarter.body),
      ...showTurn("after 90°", afterQuarter, QUARTER_CLOCKWISE, { width: 200, height: 400 }),
      check("no size is the pre-edit rendering", afterQuarter.thumb.corners !== before.thumb.corners && afterQuarter.preview.corners !== before.preview.corners, [before.thumb.corners, afterQuarter.thumb.corners]),
    ]);
    const half = await media(ctx, "rotate by 90° again", "POST", `/assets/${file.id}/transform`, { body: { rotate: 90 } });
    const afterHalf = await allSizes(ctx, file.id, "quartiers.png");
    await ctx.verify("a second quarter turn is a half turn", [check("the save is answered", half.status === 200, half.status), ...showTurn("after 180°", afterHalf, HALF_TURN, { width: 400, height: 200 })]);
    const reverted = await media(ctx, "revert to the original", "POST", `/assets/${file.id}/revert`);
    const afterRevert = await allSizes(ctx, file.id, "quartiers.png");
    await ctx.verify("Revert brings the original back", [check("the revert is answered", reverted.status === 200, reverted.status), ...showTurn("after Revert", afterRevert, UPRIGHT, { width: 400, height: 200 })]);
  },
};

/**
 * Clicks a rotate button until the editor lists the turn as a pending change: the page renders on the server and a
 * click before it hydrates does nothing.
 *
 * @param {import("../../media.mjs").Tab} tab The editor tab
 * @param {string} button The button's name
 * @param {RegExp} pending The pending change it adds
 * @returns {Promise<boolean>} Whether the turn is pending
 */
async function turnOnce(tab, button, pending) {
  await tab.page.getByRole("button", { name: button }).waitFor({ timeout: 30_000 }).catch(() => undefined);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await tab.page.getByRole("button", { name: button }).click().catch(() => undefined);
    if (await tab.page.getByText(pending).first().isVisible({ timeout: 1500 }).catch(() => false)) {
      await tab.page.waitForTimeout(1000);
      return true;
    }
    await tab.page.waitForTimeout(1500);
  }
  return false;
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const theEditorsRotateButtonsSaveTheTurnTheyName = {
  id: "the-editors-rotate-buttons-save-the-turn-they-name",
  title: "in the editor Rotate right then Save turns the file and its sizes a quarter clockwise, and Rotate left then Save as copy writes a copy turned a quarter counter-clockwise beside an untouched source",
  entryPoint: "/modules/media/editor?asset=<id>",
  async run(/** @type {Ctx} */ ctx) {
    const folder = await createFolder(ctx, ctx.unique("Buttons"));
    const right = await uploaded(ctx, { folderId: folder.id, name: "droite.png", mimetype: "image/png", bytes: await quadrants() });
    const left = await uploaded(ctx, { folderId: folder.id, name: "gauche.png", mimetype: "image/png", bytes: await quadrants() });
    const before = await allSizes(ctx, right.id, "droite.png");
    const tab = await ctx.tab();
    await tab.signIn("admin");
    await tab.goto(`/modules/media/editor?asset=${right.id}`);
    const pendingRight = await rotateOnce(tab);
    await tab.click({ role: "button", name: /^Save change/ });
    await settled(ctx, right.id, (asset) => pick(asset, "width") === 200);
    const afterRight = await allSizes(ctx, right.id, "droite.png");
    await ctx.verify("Rotate right then Save", [
      check("the quarter turn was pending", pendingRight, pendingRight),
      ...showTurn("before", before, UPRIGHT, { width: 400, height: 200 }),
      ...showTurn("after Rotate right and Save", afterRight, QUARTER_CLOCKWISE, { width: 200, height: 400 }),
    ]);
    await tab.goto(`/modules/media/editor?asset=${left.id}`);
    const pendingLeft = await turnOnce(tab, "Rotate left", /Rotate 270°/);
    await tab.click({ role: "button", name: "Save as copy" });
    let listed = await folderAssets(ctx, folder.id);
    for (let attempt = 0; attempt < 20 && listed.assets.length < 3; attempt += 1) {
      await tab.page.waitForTimeout(500);
      listed = await folderAssets(ctx, folder.id);
    }
    const copy = listed.assets.find((asset) => ![right.id, left.id].includes(text(asset, "id")));
    const copied = copy ? await allSizes(ctx, text(copy, "id"), encodeURIComponent(text(copy, "name"))) : null;
    const source = await allSizes(ctx, left.id, "gauche.png");
    await ctx.verify("Rotate left then Save as copy", [
      check("the quarter turn was pending", pendingLeft, pendingLeft),
      check("a copy was added beside the source", copy !== undefined && deliveryPath(copy) !== "", listed.assets.length),
      ...(copied ? showTurn("the copy", copied, QUARTER_COUNTER_CLOCKWISE, { width: 200, height: 400 }) : [check("the copy is served", false, "no copy")]),
      ...showTurn("the source", source, UPRIGHT, { width: 400, height: 200 }),
    ]);
  },
};

/**
 * Journeys of which way the editor turns an image.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function rotationJourneys() {
  return [aSavedRotationTurnsEverySizeClockwise, theEditorsRotateButtonsSaveTheTurnTheyName];
}
