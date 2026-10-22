import { expect } from "chai";
import { presetRow } from "../../../routes/media/manage";
import type { MediaAsset } from "../../../db";
import type { MediaPresetConfig } from "../../../presets";

const API_ORIGIN = "https://api.example.com";
const DASHBOARD_ORIGIN = "https://dashboard.example.com";
const PRESET = { id: "thumb", fit: "cover" } as MediaPresetConfig;
const ASSET = { _id: "asset-1", name: "photo one.png" } as MediaAsset;

/**
 * The preset's live example <img> must load from the dashboard's own origin
 * (its /media relay carries the session, so a private example loads too),
 * while the copyable urlPattern keeps the public/API origin.
 */
describe("[unit] routes/manage — preset example URL origin", () => {
  it("builds exampleUrl on the dashboard origin, urlPattern on the public origin", () => {
    const row = presetRow({
      preset: PRESET,
      origin: API_ORIGIN,
      exampleOrigin: DASHBOARD_ORIGIN,
      renderedKeys: [],
      example: ASSET,
    });

    expect(row.exampleUrl).to.equal(
      `${DASHBOARD_ORIGIN}/media/asset-1/thumb/photo%20one.png`,
    );
    expect(row.urlPattern).to.equal(
      `${API_ORIGIN}/media/{asset}/thumb/{filename}`,
    );
  });

  it("has no exampleUrl without an example", () => {
    const row = presetRow({
      preset: PRESET,
      origin: API_ORIGIN,
      exampleOrigin: DASHBOARD_ORIGIN,
      renderedKeys: [],
    });
    expect(row.exampleUrl).to.equal(null);
  });
});
