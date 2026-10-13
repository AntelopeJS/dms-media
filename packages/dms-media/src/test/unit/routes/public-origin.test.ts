import { expect } from "chai";
import { configureMediaModule, getMediaConfig } from "../../../config";
import { resolvePublicOrigin } from "../../../routes/media/controller";

const API_BASE_URL = "http://127.0.0.1:5014";
const PUBLIC_BASE_URL = "https://api.example.com";

describe("[unit] routes/controller — public origin of copied links", () => {
  after(() => {
    configureMediaModule({});
  });

  it("falls back on the DMS apiBaseUrl without a configured publicBaseUrl", () => {
    configureMediaModule({});
    expect(getMediaConfig().publicBaseUrl).to.equal(undefined);
    expect(
      resolvePublicOrigin(getMediaConfig().publicBaseUrl, API_BASE_URL),
    ).to.equal(API_BASE_URL);
  });

  it("prefers the configured publicBaseUrl, without its trailing slash", () => {
    configureMediaModule({ publicBaseUrl: ` ${PUBLIC_BASE_URL}/ ` });
    expect(
      resolvePublicOrigin(getMediaConfig().publicBaseUrl, API_BASE_URL),
    ).to.equal(PUBLIC_BASE_URL);
  });

  it("treats a blank publicBaseUrl as absent", () => {
    configureMediaModule({ publicBaseUrl: "  " });
    expect(getMediaConfig().publicBaseUrl).to.equal(undefined);
    expect(resolvePublicOrigin(undefined, `${API_BASE_URL}/`)).to.equal(
      API_BASE_URL,
    );
  });

  it("leaves links relative when no base URL is configured", () => {
    expect(resolvePublicOrigin(undefined, undefined)).to.equal("");
  });
});
