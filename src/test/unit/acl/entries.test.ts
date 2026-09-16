import { expect } from "chai";
import { parseFolderAcl, serializeAcl } from "../../../acl/entries";
import type { MediaFolder } from "../../../db/tables";
import type { AclEntry } from "../../../types";

const READ_ENTRY: AclEntry = {
  subject: { kind: "role", id: "editors" },
  rights: ["read"],
};

function folderWithAcl(json_acl: string | undefined): MediaFolder {
  return { json_acl } as MediaFolder;
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

  it("ignores malformed JSON", () => {
    expect(parseFolderAcl(folderWithAcl("{not json"))).to.equal(undefined);
  });

  it("ignores JSON that is not an array", () => {
    expect(parseFolderAcl(folderWithAcl('{"subject":"x"}'))).to.equal(
      undefined,
    );
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
