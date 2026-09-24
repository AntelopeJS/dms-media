import {
  MarkModuleScopedPermission,
  UnmarkModuleScopedPermission,
} from "@antelopejs/interface-dms/permissions";
import { expect } from "chai";
import { filterGrantablePermissions } from "../../../acl/grantable";
import { OWNER_WILDCARD_PERMISSION } from "../../../constants";
import { MEDIA_PAGE_PERMISSION } from "../../../pages/media";

const MODULE_PAGE_PERMISSION = "classified.page";
const MODULE_ACTION_PERMISSION = "classified.page.table.edit";
const REGULAR_PERMISSION = "articles.table.edit";

describe("[unit] acl/grantable — filterGrantablePermissions", () => {
  before(() => {
    MarkModuleScopedPermission(MODULE_PAGE_PERMISSION);
  });

  after(() => {
    UnmarkModuleScopedPermission(MODULE_PAGE_PERMISSION);
  });

  it("keeps regular permissions untouched", () => {
    const filtered = filterGrantablePermissions(
      new Set([REGULAR_PERMISSION, MEDIA_PAGE_PERMISSION]),
    );
    expect([...filtered].sort()).to.deep.equal([
      REGULAR_PERMISSION,
      MEDIA_PAGE_PERMISSION,
    ]);
  });

  it("drops module-scoped permissions", () => {
    const filtered = filterGrantablePermissions(
      new Set([MODULE_PAGE_PERMISSION, REGULAR_PERMISSION]),
    );
    expect(filtered.has(MODULE_PAGE_PERMISSION)).to.equal(false);
    expect(filtered.has(REGULAR_PERMISSION)).to.equal(true);
  });

  it("drops dot-separated descendants of module-scoped permissions", () => {
    const filtered = filterGrantablePermissions(
      new Set([MODULE_ACTION_PERMISSION]),
    );
    expect(filtered.size).to.equal(0);
  });

  it("returns the owner wildcard set unchanged", () => {
    const permissions = new Set([
      OWNER_WILDCARD_PERMISSION,
      MODULE_PAGE_PERMISSION,
    ]);
    expect(filterGrantablePermissions(permissions)).to.equal(permissions);
  });
});
