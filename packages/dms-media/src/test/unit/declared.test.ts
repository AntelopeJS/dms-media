import { setTimeout as delay } from "node:timers/promises";
import { expect } from "chai";
import { parseDeclaration, withDeclarationLock } from "../../declared/records";
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
    }).catch((error: unknown) =>
      error instanceof Error ? error.message : String(error),
    );
    const next = withDeclarationLock("default", "asset", "k", async () => "ok");
    expect(await failing).to.equal("boom");
    expect(await next).to.equal("ok");
  });
});
