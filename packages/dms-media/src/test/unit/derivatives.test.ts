import { expect } from "chai";
import { partitionDerivatives } from "../../derivatives";
import { presetCacheKey } from "../../presets";

const THUMB_PRESET = {
  id: "thumb",
  width: 300,
  height: 300,
  fit: "cover" as const,
  format: "webp" as const,
  quality: 80,
};

describe("[unit] derivatives — partitionDerivatives", () => {
  it("keeps derivatives whose cache key matches a configured preset", () => {
    const cacheKey = presetCacheKey(THUMB_PRESET);
    const { fresh, stale } = partitionDerivatives(
      { [cacheKey]: "media-derivatives/a/thumb.webp" },
      [THUMB_PRESET],
    );
    expect(fresh).to.deep.equal({
      [cacheKey]: "media-derivatives/a/thumb.webp",
    });
    expect(stale).to.deep.equal({});
  });

  it("marks derivatives stale when the preset config changed", () => {
    const oldKey = presetCacheKey({ ...THUMB_PRESET, quality: 60 });
    const { fresh, stale } = partitionDerivatives(
      { [oldKey]: "media-derivatives/a/old.webp" },
      [THUMB_PRESET],
    );
    expect(fresh).to.deep.equal({});
    expect(stale).to.deep.equal({ [oldKey]: "media-derivatives/a/old.webp" });
  });

  it("marks derivatives stale when their preset was removed", () => {
    const removedKey = presetCacheKey({ ...THUMB_PRESET, id: "gone" });
    const { stale } = partitionDerivatives(
      { [removedKey]: "media-derivatives/a/gone.webp" },
      [THUMB_PRESET],
    );
    expect(Object.keys(stale)).to.have.length(1);
  });

  it("changes the cache key whenever any preset parameter changes", () => {
    const base = presetCacheKey(THUMB_PRESET);
    expect(presetCacheKey({ ...THUMB_PRESET, width: 301 })).to.not.equal(base);
    expect(presetCacheKey({ ...THUMB_PRESET, format: "jpeg" })).to.not.equal(
      base,
    );
    expect(presetCacheKey({ ...THUMB_PRESET })).to.equal(base);
  });
});
