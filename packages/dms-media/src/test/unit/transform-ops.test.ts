import { expect } from "chai";
import { composeTransforms } from "../../transform-ops";

describe("[unit] transform-ops — composeTransforms", () => {
  it("adds rotations and drops a full turn", () => {
    expect(composeTransforms({ rotate: 90 }, { rotate: 270 })).to.deep.equal({
      rotate: undefined,
      crop: undefined,
    });
  });

  it("nests a crop inside the crop already applied", () => {
    const composed = composeTransforms(
      { crop: { x: 0.5, y: 0, width: 0.5, height: 1 } },
      { crop: { x: 0, y: 0.5, width: 1, height: 0.5 } },
    );
    expect(composed.crop).to.deep.equal({
      x: 0.5,
      y: 0.5,
      width: 0.5,
      height: 0.5,
    });
  });

  it("turns the applied crop with a new quarter turn", () => {
    const composed = composeTransforms(
      { crop: { x: 0, y: 0, width: 0.5, height: 0.25 } },
      { rotate: 90 },
    );
    expect(composed).to.deep.equal({
      rotate: 90,
      crop: { x: 0.75, y: 0, width: 0.25, height: 0.5 },
    });
  });
});
