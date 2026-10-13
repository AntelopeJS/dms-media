import { expect } from "chai";
import { configureMediaModule } from "../../config";
import { suggestFreeNames } from "../../upload-names";
import {
  expectedImageFormat,
  isUploadTypeAllowed,
  mimetypeMatches,
} from "../../upload-policy";

describe("[unit] upload rules — free names and accepted types", () => {
  after(() => {
    configureMediaModule({});
  });

  it("numbers duplicates from (2), ignoring case and earlier files of the batch", () => {
    expect(
      suggestFreeNames(
        ["photo.jpg", "photo (2).jpg"],
        ["PHOTO.jpg", "photo.jpg", "new.jpg", "new.jpg", "README"],
      ),
    ).to.deep.equal([
      "PHOTO (3).jpg",
      "photo (4).jpg",
      null,
      "new (2).jpg",
      null,
    ]);
  });

  it("continues an existing copy number and keeps names without extension", () => {
    expect(
      suggestFreeNames(["shot (2).png", "notes"], ["shot (2).png", "notes"]),
    ).to.deep.equal(["shot (3).png", "notes (2)"]);
  });

  it("matches mimetypes exactly or by prefix, ignoring case and parameters", () => {
    expect(mimetypeMatches("IMAGE/PNG", ["image/*"])).to.equal(true);
    expect(
      mimetypeMatches("text/plain; charset=utf-8", ["text/plain"]),
    ).to.equal(true);
    expect(mimetypeMatches("application/pdf", ["image/*"])).to.equal(false);
  });

  it("refuses HTML by type or extension, whatever the configuration", () => {
    configureMediaModule({ allowedMimetypes: ["text/*", "application/*"] });
    expect(isUploadTypeAllowed("page.txt", "text/html")).to.equal(false);
    expect(isUploadTypeAllowed("page.HTML", "text/plain")).to.equal(false);
    expect(isUploadTypeAllowed("doc.xhtml", "application/xml")).to.equal(false);
    expect(isUploadTypeAllowed("notes.txt", "text/plain")).to.equal(true);
    configureMediaModule({});
    expect(
      isUploadTypeAllowed("setup.exe", "application/x-msdownload"),
    ).to.equal(false);
    expect(
      isUploadTypeAllowed(
        "deck.pptx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ),
    ).to.equal(true);
  });

  it("expects a decodable format only for raster types sharp reads", () => {
    expect(expectedImageFormat("image/png")).to.equal("png");
    expect(expectedImageFormat("image/svg+xml")).to.equal(undefined);
    expect(expectedImageFormat("image/x-icon")).to.equal(undefined);
  });
});
