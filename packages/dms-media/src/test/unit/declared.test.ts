import { setTimeout as delay } from "node:timers/promises";
import { expect } from "chai";
import {
  hashState,
  judgeDeclaredRow,
  MediaDeclarationError,
  parseDeclaration,
  withDeclarationLock,
} from "../../declared/records";
import { writeWhenReachable } from "../../declared/readiness";
import type { MediaDeclaration } from "../../db";
import { declaredFolderSchema } from "../../validation/declared.schema";

const ROW = { _id: "row-1" };
const APPLIED = hashState({ name: "Procedures" });
const DECLARED = hashState({ declared: 1 });

function record(): MediaDeclaration {
  return {
    _id: "declaration-1",
    kind: "folder",
    key: "helio.procedures",
    targetId: ROW._id,
    declaredHash: DECLARED,
    appliedHash: APPLIED,
  } as MediaDeclaration;
}

describe("[unit] declared content — the refresh rule", () => {
  it("keeps a deleted row deleted", () => {
    expect(
      judgeDeclaredRow(record(), undefined, undefined, DECLARED),
    ).to.deep.equal({ status: "deleted" });
  });

  it("preserves a row whose state moved away from the applied one", () => {
    const edited = hashState({ name: "Our procedures" });
    expect(
      judgeDeclaredRow(record(), ROW, edited, hashState({ declared: 2 })),
    ).to.deep.equal({ status: "preserved", id: ROW._id });
  });

  it("reports an untouched row declared the same way as unchanged", () => {
    expect(judgeDeclaredRow(record(), ROW, APPLIED, DECLARED)).to.deep.equal({
      status: "unchanged",
      id: ROW._id,
    });
  });

  it("lets an untouched row with a new declaration be refreshed", () => {
    expect(
      judgeDeclaredRow(record(), ROW, APPLIED, hashState({ declared: 2 })),
    ).to.equal(undefined);
  });

  it("hashes equal states equally and different states differently", () => {
    expect(hashState({ a: 1, b: null })).to.equal(hashState({ a: 1, b: null }));
    expect(hashState({ a: 1 })).to.not.equal(hashState({ a: 2 }));
  });
});

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

describe("[unit] declared content — storage writes at startup", () => {
  it("retries a write while its endpoint does not answer", async function () {
    this.timeout(10_000);
    let attempts = 0;
    const result = await writeWhenReachable(async () => {
      attempts += 1;
      if (attempts < 3) throw new TypeError("fetch failed");
      return "stored";
    });
    expect(result).to.equal("stored");
    expect(attempts).to.equal(3);
  });

  it("does not retry a refused write", async () => {
    let attempts = 0;
    const refusal = await writeWhenReachable(async () => {
      attempts += 1;
      throw new Error("Failed to upload logo.png: 413");
    }).catch((error: Error) => error.message);
    expect(refusal).to.contain("413");
    expect(attempts).to.equal(1);
  });
});
