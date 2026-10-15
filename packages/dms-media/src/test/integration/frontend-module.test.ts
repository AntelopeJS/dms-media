import { GetFrontendModules } from "@antelopejs/interface-dms/page";
import { expect } from "chai";
import { MEDIA_DELIVERY_PROXY, MEDIA_FRONTEND_MODULE } from "../../index";

describe("frontend module", () => {
  it("declares the file links as a backend prefix the frontend server proxies with the session", async () => {
    const modules = await GetFrontendModules();
    const media = modules.find(
      (module) => module.name === MEDIA_FRONTEND_MODULE,
    );
    expect(media?.backendProxies).to.deep.equal([MEDIA_DELIVERY_PROXY]);
  });
});
