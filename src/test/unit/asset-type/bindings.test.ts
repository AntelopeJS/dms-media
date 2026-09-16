import {
  GetPermissionId,
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { expect } from "chai";
import { buildBindingAcl } from "../../../asset-type/bindings";
import {
  MEDIA_FOLDERS_MANAGE_PERMISSION,
  MEDIA_PERMISSIONS_MANAGE_PERMISSION,
} from "../../../constants";
import type { AclEntry } from "../../../types";

@RegisterPage()
class BindingProbePage extends PageController("binding-probe", {
  displayName: "Binding probe",
  description: "Probe page for binding permission inheritance",
  icon: "i-ph-images",
  category: pagesCategory,
}) {
  static content = CustomComponent("dms-media-binding-probe");
}

class DetachedProbePage extends PageController("binding-probe-detached", {
  displayName: "Detached probe",
  category: pagesCategory,
}) {
  static content = CustomComponent("dms-media-binding-probe");
}

describe("[unit] asset-type/bindings — buildBindingAcl", () => {
  it("derives read and write entries from the permission mapping", () => {
    const entries = buildBindingAcl({
      id: "articles.cover",
      permissionMapping: {
        read: ["articles.page"],
        write: ["articles.page.table.edit"],
      },
    });
    expect(entries).to.deep.include({
      subject: { kind: "permission", id: "articles.page" },
      rights: ["read"],
    });
    expect(entries).to.deep.include({
      subject: { kind: "permission", id: "articles.page.table.edit" },
      rights: ["write"],
    });
  });

  it("always keeps media managers in control of linked folders", () => {
    const entries = buildBindingAcl({ id: "bare" });
    const managed = entries.filter((entry) => entry.rights.includes("manage"));
    expect(managed.map((entry) => entry.subject.id).sort()).to.deep.equal(
      [
        MEDIA_FOLDERS_MANAGE_PERMISSION,
        MEDIA_PERMISSIONS_MANAGE_PERMISSION,
      ].sort(),
    );
  });

  it("derives read and write entries from the owning page permission", () => {
    const pagePermission = GetPermissionId(BindingProbePage);
    expect(pagePermission, "probe page permission").to.be.a("string");
    const entries = buildBindingAcl({
      id: "probe.page-derived",
      permissionsFromPage: BindingProbePage,
    });
    expect(entries).to.deep.include({
      subject: { kind: "permission", id: pagePermission },
      rights: ["read"],
    });
    expect(entries).to.deep.include({
      subject: { kind: "permission", id: pagePermission },
      rights: ["write"],
    });
  });

  it("lets explicit mapping entries override page-derived defaults per right", () => {
    const pagePermission = GetPermissionId(BindingProbePage);
    const entries = buildBindingAcl({
      id: "probe.override",
      permissionsFromPage: BindingProbePage,
      permissionMapping: { write: ["probe.custom.write"] },
    });
    expect(entries).to.deep.include({
      subject: { kind: "permission", id: pagePermission },
      rights: ["read"],
    });
    expect(entries).to.deep.include({
      subject: { kind: "permission", id: "probe.custom.write" },
      rights: ["write"],
    });
    expect(entries).to.not.deep.include({
      subject: { kind: "permission", id: pagePermission },
      rights: ["write"],
    });
  });

  it("treats an explicit empty mapping array as a per-right opt-out", () => {
    const pagePermission = GetPermissionId(BindingProbePage);
    const entries = buildBindingAcl({
      id: "probe.opt-out",
      permissionsFromPage: BindingProbePage,
      permissionMapping: { read: [] },
    });
    const readEntries = entries.filter((entry) =>
      entry.rights.includes("read"),
    );
    expect(readEntries).to.deep.equal([]);
    expect(entries).to.deep.include({
      subject: { kind: "permission", id: pagePermission },
      rights: ["write"],
    });
  });

  it("derives nothing from a page that is not registered", () => {
    const entries = buildBindingAcl({
      id: "probe.detached",
      permissionsFromPage: DetachedProbePage,
    });
    const derived = entries.filter(
      (entry) =>
        entry.rights.includes("read") || entry.rights.includes("write"),
    );
    expect(derived).to.deep.equal([]);
  });

  it("lets an explicit ACL fully replace the derived entries", () => {
    const explicit: AclEntry[] = [
      { subject: { kind: "role", id: "librarians" }, rights: ["manage"] },
    ];
    const entries = buildBindingAcl({
      id: "custom",
      acl: explicit,
      permissionMapping: { read: ["ignored.permission"] },
    });
    expect(entries).to.deep.equal(explicit);
  });
});
