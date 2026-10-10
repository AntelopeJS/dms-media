import {
  MarkModuleScopedPermission,
  UnmarkModuleScopedPermission,
} from "@antelopejs/interface-dms/permissions";
import { expect } from "chai";
import { filterGrantablePermissions } from "../../../acl/grantable";
import { OWNER_WILDCARD_PERMISSION } from "../../../constants";
import { MEDIA_PAGE_PERMISSION } from "../../../pages/files";
import { withPermissionAncestors } from "../../helpers/permission-ancestors";

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

  it("keeps regular permissions held with their ancestors", async () => {
    const permissions = withPermissionAncestors([
      REGULAR_PERMISSION,
      MEDIA_PAGE_PERMISSION,
    ]);
    const filtered = await filterGrantablePermissions(new Set(permissions));
    expect([...filtered].sort()).to.deep.equal([...permissions].sort());
  });

  it("drops a grant whose registered ancestors are not held", async () => {
    const filtered = await filterGrantablePermissions(
      new Set([MEDIA_PAGE_PERMISSION]),
    );
    expect(filtered.has(MEDIA_PAGE_PERMISSION)).to.equal(false);
  });

  it("drops module-scoped permissions", async () => {
    const filtered = await filterGrantablePermissions(
      new Set([MODULE_PAGE_PERMISSION, REGULAR_PERMISSION]),
    );
    expect(filtered.has(MODULE_PAGE_PERMISSION)).to.equal(false);
    expect(filtered.has(REGULAR_PERMISSION)).to.equal(true);
  });

  it("drops dot-separated descendants of module-scoped permissions", async () => {
    const filtered = await filterGrantablePermissions(
      new Set([MODULE_ACTION_PERMISSION]),
    );
    expect(filtered.size).to.equal(0);
  });

  it("returns the owner wildcard set unchanged", async () => {
    const permissions = new Set([
      OWNER_WILDCARD_PERMISSION,
      MODULE_PAGE_PERMISSION,
    ]);
    expect(await filterGrantablePermissions(permissions)).to.equal(permissions);
  });
});
