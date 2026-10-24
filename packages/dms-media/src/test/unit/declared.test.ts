import { setTimeout as delay } from "node:timers/promises";
import { expect } from "chai";
import {
  MediaDeclarationError,
  parseDeclaration,
  withDeclarationLock,
} from "../../declared/records";
import { declaredFolderSchema } from "../../validation/declared.schema";

describe("[unit] declared content — declarations", () => {
  it("keeps an explicit default tenant and defaults the visibility", () => {
    const parsed = parseDeclaration(
      "folder",
      { tenantId: "default", key: "helio.procedures", name: " Procedures " },
      declaredFolderSchema,
    );
    expect(parsed).to.deep.equal({
      key: "helio.procedures",
      name: "Procedures",
      visibility: "private",
      tenantId: "default",
    });
  });

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

  it("runs the declarations of one key one after another", async () => {
    const order: string[] = [];
    const slow = withDeclarationLock("default", "folder", "k", async () => {
      await delay(20);
      order.push("first");
    });
    const fast = withDeclarationLock("default", "folder", "k", async () => {
      order.push("second");
    });
    const other = withDeclarationLock(
      "default",
      "folder",
      "other",
      async () => {
        order.push("other");
      },
    );
    await Promise.all([slow, fast, other]);
    expect(order).to.deep.equal(["other", "first", "second"]);
  });

  it("keeps running a key after a failed declaration", async () => {
    const failing = withDeclarationLock("default", "asset", "k", async () => {
      throw new Error("boom");
    }).catch((error: Error) => error.message);
    const next = withDeclarationLock("default", "asset", "k", async () => "ok");
    expect(await failing).to.equal("boom");
    expect(await next).to.equal("ok");
  });
});
