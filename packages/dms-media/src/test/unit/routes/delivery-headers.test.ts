import { expect } from "chai";
import {
  contentDisposition,
  contentSecurityPolicy,
} from "../../../routes/media/delivery-headers";

describe("[unit] routes/media/delivery-headers — active content", () => {
  it("sandboxes SVG but keeps it inline", () => {
    expect(contentSecurityPolicy("image/svg+xml")).to.equal("sandbox");
    expect(contentDisposition("image/svg+xml", "logo.svg")).to.match(
      /^inline;/,
    );
  });

  it("downloads HTML whatever its parameters", () => {
    expect(contentDisposition("text/html; charset=utf-8", "a.html")).to.match(
      /^attachment;/,
    );
    expect(contentSecurityPolicy("TEXT/HTML")).to.equal("sandbox");
  });

  it("leaves images alone and encodes non-ASCII names", () => {
    expect(contentSecurityPolicy("image/jpeg")).to.equal(undefined);
    expect(contentDisposition("image/jpeg", "Été (1).jpg")).to.equal(
      `inline; filename="Ete (1).jpg"; filename*=UTF-8''%C3%89t%C3%A9%20%281%29.jpg`,
    );
  });
});
