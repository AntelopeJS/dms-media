import { expect } from "chai";
import { retiredFiles } from "../../asset-lifecycle";
import { asset } from "./library/fixtures";

describe("[unit] asset-lifecycle — retiredFiles", () => {
  it("reads the queue as the module writes it", () => {
    const queue = ["a/original.jpg", "a/derivative.webp"];
    expect(
      retiredFiles(asset("a", { json_retiredFiles: JSON.stringify(queue) })),
    ).to.deep.equal(queue);
    expect(retiredFiles(asset("a"))).to.deep.equal([]);
  });

  it("refuses a queue that is not a list of storage keys", () => {
    for (const json_retiredFiles of ['["a.jpg", 7]', '{"a":"a.jpg"}', '"a"']) {
      expect(() => retiredFiles(asset("a", { json_retiredFiles }))).to.throw(
        "Media asset 'a' has a file deletion queue that is not a list of storage keys",
      );
    }
  });
});
