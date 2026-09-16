import { expect } from "chai";
import { cropToPixels } from "../../transform";

const DIMENSIONS = { width: 100, height: 100 };

describe("[unit] transform — cropToPixels", () => {
  it("keeps a full-frame crop at the image bounds", () => {
    const region = cropToPixels(
      { x: 0, y: 0, width: 1, height: 1 },
      DIMENSIONS,
    );
    expect(region).to.deep.equal({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
    });
  });

  it("never yields a zero-size region for a tiny crop at the right edge", () => {
    const region = cropToPixels(
      { x: 0.999, y: 0, width: 0.001, height: 1 },
      DIMENSIONS,
    );
    expect(region.width).to.be.greaterThan(0);
    expect(region.height).to.be.greaterThan(0);
    expect(region.left + region.width).to.be.at.most(DIMENSIONS.width);
  });

  it("never yields a zero-size region for a tiny crop at the bottom edge", () => {
    const region = cropToPixels(
      { x: 0, y: 0.999, width: 1, height: 0.001 },
      DIMENSIONS,
    );
    expect(region.height).to.be.greaterThan(0);
    expect(region.top + region.height).to.be.at.most(DIMENSIONS.height);
  });

  it("keeps the region inside the frame for a mid crop", () => {
    const region = cropToPixels(
      { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
      DIMENSIONS,
    );
    expect(region).to.deep.equal({
      left: 25,
      top: 25,
      width: 50,
      height: 50,
    });
  });
});
