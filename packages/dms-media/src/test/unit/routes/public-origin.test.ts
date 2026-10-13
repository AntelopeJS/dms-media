import { expect } from "chai";
import { configureMediaModule, getMediaConfig } from "../../../config";
import { resolvePublicOrigin } from "../../../routes/media/controller";

const REQUEST_ORIGIN = "http://127.0.0.1:5014";
const PUBLIC_BASE_URL = "https://api.example.com";

describe("[unit] routes/controller — public origin of copied links", () => {
  after(() => {
    configureMediaModule({});
  });

  it("keeps the request's origin without a configured publicBaseUrl", () => {
    configureMediaModule({});
    expect(getMediaConfig().publicBaseUrl).to.equal(undefined);
    expect(
      resolvePublicOrigin(getMediaConfig().publicBaseUrl, REQUEST_ORIGIN),
    ).to.equal(REQUEST_ORIGIN);
  });

  it("prefers the configured publicBaseUrl, without its trailing slash", () => {
    configureMediaModule({ publicBaseUrl: ` ${PUBLIC_BASE_URL}/ ` });
    expect(
      resolvePublicOrigin(getMediaConfig().publicBaseUrl, REQUEST_ORIGIN),
    ).to.equal(PUBLIC_BASE_URL);
  });

  it("treats a blank publicBaseUrl as absent", () => {
    configureMediaModule({ publicBaseUrl: "  " });
    expect(getMediaConfig().publicBaseUrl).to.equal(undefined);
    expect(resolvePublicOrigin(undefined, `${REQUEST_ORIGIN}/`)).to.equal(
      REQUEST_ORIGIN,
    );
  });
});
