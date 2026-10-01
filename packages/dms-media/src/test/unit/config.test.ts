import { expect } from "chai";
import { DEFAULT_ROOT_ACL } from "../../acl/defaults";
import { configureMediaModule, getMediaConfig } from "../../config";
import { DEFAULT_PRESETS } from "../../presets";
import type { AclEntry } from "../../types";

const CUSTOM_ROOT_ACL: AclEntry[] = [
  { subject: { kind: "role", id: "curators" }, rights: ["read"] },
];

describe("[unit] config — configureMediaModule", () => {
  after(() => {
    configureMediaModule({});
  });

  it("falls back to the default root ACL and presets", () => {
    configureMediaModule({});
    const config = getMediaConfig();
    expect(config.rootAcl).to.equal(DEFAULT_ROOT_ACL);
    expect([...config.presets.keys()]).to.deep.equal(
      DEFAULT_PRESETS.map((preset) => preset.id),
    );
    expect(config.storage).to.equal(undefined);
  });

  it("replaces the default root ACL with the configured one", () => {
    configureMediaModule({ rootAcl: CUSTOM_ROOT_ACL });
    expect(getMediaConfig().rootAcl).to.equal(CUSTOM_ROOT_ACL);
  });

  it("indexes configured presets by id and drops the defaults", () => {
    configureMediaModule({
      presets: [{ id: "hero", width: 1200, fit: "cover", format: "webp" }],
    });
    const presets = getMediaConfig().presets;
    expect(presets.get("hero")?.width).to.equal(1200);
    expect(presets.has("thumb")).to.equal(false);
  });

  it("keeps the configured storage name", () => {
    configureMediaModule({ storage: "r2-main" });
    expect(getMediaConfig().storage).to.equal("r2-main");
  });
});
