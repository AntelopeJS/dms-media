import { expect } from "chai";
import { parseDerivatives } from "../../../routes/media/storage-keys";
import { asset } from "../library/fixtures";

describe("[unit] routes/media/storage-keys — parseDerivatives", () => {
  it("reads image sizes as the module writes them", () => {
    const sizes = { "w=320": "a/320.webp", "w=640": "a/640.webp" };
    expect(
      parseDerivatives(asset("a", { json_derivatives: JSON.stringify(sizes) })),
    ).to.deep.equal(sizes);
    expect(
      parseDerivatives(asset("a", { json_derivatives: "" })),
    ).to.deep.equal({});
  });

  it("refuses image sizes that are not a map of storage keys", () => {
    for (const json_derivatives of ['["a/320.webp"]', '{"w=320":7}', "null"]) {
      expect(() => parseDerivatives(asset("a", { json_derivatives }))).to.throw(
        "Media asset 'a' has image sizes that are not a map of storage keys",
      );
    }
  });
});
