import { expect } from "chai";
import {
  MediaDeclarationError,
  parseDeclaration,
} from "../../declared/records";
import { declaredFolderSchema } from "../../validation/declared.schema";

describe("[unit] declared content — declarations from untyped callers", () => {
  it("names the key and every refused field in English", () => {
    const parse = () =>
      parseDeclaration(
        "folder",
        {
          tenantId: "default",
          key: "helio.bad",
          name: "a/b",
          visibility: "secret",
        },
        declaredFolderSchema,
      );
    expect(parse).to.throw(MediaDeclarationError, "Media folder 'helio.bad'");
    expect(parse).to.throw(/name: a name can't contain/);
    expect(parse).to.throw(/visibility/);
  });
});
