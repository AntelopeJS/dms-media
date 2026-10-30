import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { z } from "zod";
import { createdBody, readBody } from "../helpers/bodies";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const BATCH_ID = "batch-history-filters";
const BATCH_TOTAL = 4;
const BATCH_UPLOADED = 3;
const BATCH_FAILED = 1;
const BATCH_SIZE = 300;

const batchesBody = z.object({
  total: z.number(),
  results: z.array(z.object({ _id: z.string() })),
});

const INHERITED_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ["constructor", "function Object() { [native code] }"],
  ["toString", "function toString() { [native code] }"],
  ["hasOwnProperty", "function hasOwnProperty() { [native code] }"],
  ["__proto__", "[object Object]"],
];

describe("[integration] upload history — row filters", () => {
  let client: AxiosInstance;

  async function listBatches(filters: Record<string, string>) {
    const response = await client.get("/api/media/upload/batches", {
      params: filters,
    });
    expect(response.status).to.equal(HTTP_OK);
    return readBody(response, batchesBody);
  }

  before(async function () {
    this.timeout(30_000);
    const session = await ensureOwnerSession();
    client = authorizedClient(session.accessToken);
    const folderId = readBody(
      await client.post("/api/media/folders", { name: "History filters spec" }),
      createdBody,
    ).id;
    const report = await client.post("/api/media/upload/batches", {
      batchId: BATCH_ID,
      folderId,
      total: BATCH_TOTAL,
      uploaded: BATCH_UPLOADED,
      failed: BATCH_FAILED,
      size: BATCH_SIZE,
    });
    expect(report.status).to.equal(HTTP_OK);
  });

  it("keeps the batch a filter on one of its columns matches", async () => {
    const body = await listBatches({ filter__id: `eq:${BATCH_ID}` });
    expect(body.results.map((row) => row._id)).to.deep.equal([BATCH_ID]);
  });

  it("drops the batch a filter on an unknown column cannot match", async () => {
    const body = await listBatches({ filter_nonexistent: `eq:${BATCH_ID}` });
    expect(body.results).to.deep.equal([]);
    expect(body.total).to.equal(0);
  });

  for (const [column, inheritedText] of INHERITED_COLUMNS) {
    it(`treats the inherited member ${column} like an unknown column`, async () => {
      const body = await listBatches({
        [`filter_${column}`]: `eq:${inheritedText}`,
      });
      expect(body.results).to.deep.equal([]);
      expect(body.total).to.equal(0);
    });
  }
});
