import { expect } from "chai";
import type { MediaAsset, MediaFolder } from "../../../db";
import {
  buildDeliveryPath,
  resolveEffectiveVisibility,
} from "../../../routes/media/dto";
import type { AssetVisibility, FolderVisibility } from "../../../types";
import { asset, folder } from "../library/fixtures";

function assetWithVisibility(visibility: AssetVisibility): MediaAsset {
  return asset("asset", { visibility });
}

function folderWithVisibility(visibility: FolderVisibility): MediaFolder {
  return folder("folder", undefined, [], { visibility });
}

describe("[unit] routes/dto — resolveEffectiveVisibility", () => {
  it("lets an explicit asset visibility override the folder", () => {
    expect(
      resolveEffectiveVisibility(
        assetWithVisibility("public"),
        folderWithVisibility("private"),
      ),
    ).to.equal("public");
    expect(
      resolveEffectiveVisibility(
        assetWithVisibility("private"),
        folderWithVisibility("public"),
      ),
    ).to.equal("private");
  });

  it("inherits the folder visibility by default", () => {
    expect(
      resolveEffectiveVisibility(
        assetWithVisibility("inherit"),
        folderWithVisibility("public"),
      ),
    ).to.equal("public");
    expect(
      resolveEffectiveVisibility(
        assetWithVisibility("inherit"),
        folderWithVisibility("private"),
      ),
    ).to.equal("private");
  });

  it("falls back to private when the folder is missing", () => {
    expect(
      resolveEffectiveVisibility(assetWithVisibility("inherit"), undefined),
    ).to.equal("private");
  });
});

describe("[unit] routes/dto — buildDeliveryPath", () => {
  it("builds the stable delivery URL from id and name", () => {
    const photo = asset("a1", { name: "photo.png" });
    expect(buildDeliveryPath(photo)).to.equal("/media/a1/photo.png");
  });

  it("escapes unsafe characters in the filename", () => {
    const spaced = asset("a1", { name: "my file#1.png" });
    expect(buildDeliveryPath(spaced)).to.equal("/media/a1/my%20file%231.png");
  });
});
