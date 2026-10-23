import { expect } from "chai";
import type { MediaAsset } from "../../../db";
import type { MediaPresetConfig } from "../../../presets";
import { presetRow } from "../../../routes/media/manage";

const ORIGIN = "http://127.0.0.1:5010";
const ASSET_ID = "7554eb0a-c6fb-4518-a8b9-65c6e8a3e6a9";
const THUMB: MediaPresetConfig = { id: "thumb", width: 300, height: 300 };
const EXAMPLE = { _id: ASSET_ID, name: "Été à Liège.jpg" } as MediaAsset;
const EXAMPLE_PATH = `/media/${ASSET_ID}/thumb/%C3%89t%C3%A9%20%C3%A0%20Li%C3%A8ge.jpg`;

describe("[unit] routes/manage — image size cards", () => {
  it("previews the example relative to the dashboard, which carries the session", () => {
    const row = presetRow({
      preset: THUMB,
      origin: ORIGIN,
      renderedKeys: [],
      example: EXAMPLE,
    });
    expect(row.examplePreviewUrl).to.equal(EXAMPLE_PATH);
  });

  it("keeps the copied example link and pattern absolute on the public origin", () => {
    const row = presetRow({
      preset: THUMB,
      origin: ORIGIN,
      renderedKeys: [],
      example: EXAMPLE,
    });
    expect(row.exampleUrl).to.equal(`${ORIGIN}${EXAMPLE_PATH}`);
    expect(row.urlPattern).to.equal(`${ORIGIN}/media/{asset}/thumb/{filename}`);
  });

  it("has no example links without an example image", () => {
    const row = presetRow({ preset: THUMB, origin: ORIGIN, renderedKeys: [] });
    expect(row.exampleUrl).to.equal(null);
    expect(row.examplePreviewUrl).to.equal(null);
  });
});
