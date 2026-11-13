import { expect } from "chai";
import { parseFolderAcl, serializeAcl } from "../../../acl/entries";
import type { MediaFolder } from "../../../db/tables";
import type { AclEntry } from "../../../types";
import { folder } from "../library/fixtures";

const READ_ENTRY: AclEntry = {
  subject: { kind: "role", id: "editors" },
  rights: ["read"],
};

function folderWithAcl(json_acl: string | undefined): MediaFolder {
  return folder("folder", undefined, [], { json_acl });
}

describe("[unit] acl/entries — parseFolderAcl", () => {
  it("treats a missing ACL as inherited", () => {
    expect(parseFolderAcl(folderWithAcl(undefined))).to.equal(undefined);
  });

  it("treats an empty string as inherited", () => {
    expect(parseFolderAcl(folderWithAcl(""))).to.equal(undefined);
  });

  it("parses an explicit empty ACL as a lockdown, not inheritance", () => {
    expect(parseFolderAcl(folderWithAcl("[]"))).to.deep.equal([]);
  });

  it("parses stored entries back to their object form", () => {
    const folder = folderWithAcl(JSON.stringify([READ_ENTRY]));
    expect(parseFolderAcl(folder)).to.deep.equal([READ_ENTRY]);
  });

  it("fails closed on malformed JSON", () => {
    expect(parseFolderAcl(folderWithAcl("{not json"))).to.deep.equal([]);
  });

  it("fails closed on JSON that is not an array", () => {
    expect(parseFolderAcl(folderWithAcl('{"subject":"x"}'))).to.deep.equal([]);
  });

  it("fails closed on an array holding something other than ACL entries", () => {
    for (const stored of [
      [{ subject: { kind: "group", id: "editors" }, rights: ["read"] }],
      [{ subject: { kind: "role", id: 7 }, rights: ["read"] }],
      [{ subject: { kind: "role", id: "editors" }, rights: ["own"] }],
      ["editors"],
    ]) {
      expect(
        parseFolderAcl(folderWithAcl(JSON.stringify(stored))),
      ).to.deep.equal([]);
    }
  });

  it("reads back an entry with no rights as the module writes it", () => {
    const entry: AclEntry = {
      subject: { kind: "permission", id: "p" },
      rights: [],
    };
    expect(parseFolderAcl(folderWithAcl(serializeAcl([entry])))).to.deep.equal([
      entry,
    ]);
  });
});

describe("[unit] acl/entries — serializeAcl", () => {
  it("keeps the absence of an ACL as undefined", () => {
    expect(serializeAcl(undefined)).to.equal(undefined);
  });

  it("serializes an empty ACL distinctly from an absent one", () => {
    expect(serializeAcl([])).to.equal("[]");
  });

  it("round-trips entries through parseFolderAcl", () => {
    const serialized = serializeAcl([READ_ENTRY]);
    const parsed = parseFolderAcl(folderWithAcl(serialized));
    expect(parsed).to.deep.equal([READ_ENTRY]);
  });
});
