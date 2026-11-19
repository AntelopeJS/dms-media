import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { z } from "zod";
import { uploadAsset } from "../helpers/assets";
import { createdBody, readBody } from "../helpers/bodies";
import { authorizedClient } from "../helpers/http";
import { withMediaConfig } from "../helpers/media-config";
import { createRole, registerMember } from "../helpers/members";
import { ensureOwnerSession } from "../helpers/owner";
import { solidPng } from "../helpers/png";

const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const LARGE_FILE_BYTES = 20 * 1000 * 1000;
const PLAN_BYTES = 1_000_000;
const FILL_BYTES = 6000;
const TEXT_MIMETYPE = "text/plain";
const BODY = Buffer.alloc(10, 1);
const BATCH_ID = "overview-retried-batch";

const moduleEntrySchema = z.object({
  id: z.string(),
  landingSlug: z.string(),
  readout: z
    .array(z.object({ text: z.string(), tone: z.string().optional() }))
    .optional(),
  status: z.string().optional(),
});

const modulesBody = z.union([
  z.array(moduleEntrySchema),
  z.object({ modules: z.array(moduleEntrySchema) }),
]);

const batchRowSchema = z.object({
  _id: z.string(),
  files: z.number(),
  failed: z.number(),
  result: z.string(),
  attention: z.string(),
});

const batchesBody = z.object({ results: z.array(batchRowSchema) });
const attentionBody = z.object({
  items: z.array(z.object({ id: z.string(), value: z.number().optional() })),
});
const activityBody = z.object({
  items: z.array(z.object({ title: z.string(), to: z.string().optional() })),
});

function reportRetriedBatch(
  client: AxiosInstance,
  folderId: string,
  uploaded: number,
  failed: number,
) {
  return client.post("/api/media/upload/batches", {
    batchId: BATCH_ID,
    folderId,
    total: 2,
    uploaded,
    failed,
    size: 10,
    failures: failed
      ? [{ name: "overview-b.txt", reason: "Network error" }]
      : [],
  });
}

async function flaggedFailures(client: AxiosInstance): Promise<number> {
  const rows = await client.get("/api/media/upload/batches", {
    params: { filter_attention: "is:yes" },
  });
  return readBody(rows, batchesBody).results.reduce(
    (total, row) => total + row.failed,
    0,
  );
}

async function countedFailures(client: AxiosInstance): Promise<number> {
  const attention = await client.get("/api/media/stats/attention");
  const item = readBody(attention, attentionBody).items.find(
    (entry) => entry.id === "failed-uploads",
  );
  return item?.value ?? 0;
}

describe("[integration] media activity and overview — figures, upload history and module catalog", () => {
  let client: AxiosInstance;
  let folderId: string;

  before(async function () {
    this.timeout(30_000);
    const session = await ensureOwnerSession();
    client = authorizedClient(session.accessToken);
    folderId = readBody(
      await client.post("/api/media/folders", { name: "Overview figures" }),
      createdBody,
    ).id;
  });

  after(async () => {
    await client.delete(`/api/media/folders/${folderId}`);
  });

  it("lands the catalog tile on the overview, with a readout", async () => {
    const response = await client.get("/dms/modules-listing");
    expect(response.status).to.equal(HTTP_OK);
    const listing = readBody(response, modulesBody);
    const entries = Array.isArray(listing) ? listing : listing.modules;
    const media = entries.find((entry) => entry.id === "media");
    expect(media?.landingSlug).to.equal("/modules/media/overview");
    expect(media?.readout).to.have.length(2);
  });

  it("keeps the newest report of a retried batch only", async () => {
    await uploadAsset(client, folderId, "overview-a.txt", TEXT_MIMETYPE, BODY);
    const report = (uploaded: number, failed: number) =>
      reportRetriedBatch(client, folderId, uploaded, failed);
    expect((await report(1, 1)).status).to.equal(HTTP_OK);
    const failedOnly = await client.get("/api/media/upload/batches", {
      params: { filter_result: "is:partial,failed" },
    });
    expect(
      readBody(failedOnly, batchesBody).results.map((row) => row._id),
    ).to.include(BATCH_ID);
    expect((await report(2, 0)).status).to.equal(HTTP_OK);
    const all = await client.get("/api/media/upload/batches");
    const row = readBody(all, batchesBody).results.find(
      (entry) => entry._id === BATCH_ID,
    );
    expect(row).to.include({ failed: 0, result: "complete" });
    const stillFailed = await client.get("/api/media/upload/batches", {
      params: { filter_result: "is:partial,failed" },
    });
    expect(
      readBody(stillFailed, batchesBody).results.map((entry) => entry._id),
    ).to.not.include(BATCH_ID);
  });

  it("counts on the overview exactly the failures the history flags", async () => {
    const failingFolder = readBody(
      await client.post("/api/media/folders", {
        name: "Overview failing uploads",
      }),
      createdBody,
    ).id;
    await client.post("/api/media/upload/batches", {
      batchId: "overview-failing-batch",
      folderId: failingFolder,
      total: 3,
      uploaded: 0,
      failed: 3,
      size: 0,
    });
    const flagged = () => flaggedFailures(client);
    const counted = () => countedFailures(client);
    const before = await counted();
    expect(before).to.equal(await flagged());
    expect(before).to.be.at.least(3);
    await client.delete(`/api/media/folders/${failingFolder}`);
    expect(await counted()).to.equal(before - 3);
    expect(await counted()).to.equal(await flagged());
  });

  it("drops the report of a batch that ended complete from the activity", async () => {
    const response = await client.get("/api/media/activity", {
      params: { limit: 50 },
    });
    const titles = readBody(response, activityBody).items.map(
      (item) => item.title,
    );
    expect(titles).to.not.include("$dms_media.activity.upload_batch");
    expect(titles).to.not.include("$dms_media.activity.upload_batch_partial");
  });

  it("serves the image sizes with absolute links and the default flag", async () => {
    const response = await client.get("/api/media/presets");
    expect(response.data.isDefault).to.be.a("boolean");
    expect(response.data.presets[0].urlPattern).to.match(/^https?:\/\//);
    for (const preset of response.data.presets) {
      if (preset.examplePreviewUrl === null) continue;
      expect(preset.examplePreviewUrl).to.match(/^\/media\//);
      expect(preset.exampleUrl).to.match(/^https?:\/\//);
    }
    const cache = await client.get("/api/media/presets/cache");
    expect(
      cache.data.items.map((item: { id: string }) => item.id),
    ).to.deep.equal(["edits", "public", "private", "sweep"]);
  });

  it("keeps the overview figures and feed to owners", async () => {
    const roleId = await createRole("overview-plain-member", []);
    const member = await registerMember("OverviewMember", [roleId]);
    for (const path of [
      "/api/media/stats/kpis",
      "/api/media/stats/storage",
      "/api/media/stats/attention",
      "/api/media/stats/recent",
      "/api/media/activity",
    ]) {
      const response = await member.client.get(path);
      expect(response.status, path).to.equal(HTTP_FORBIDDEN);
      expect((await client.get(path)).status, path).to.equal(HTTP_OK);
    }
  });
});

const storageBody = z.object({
  value: z.number(),
  segments: z.array(
    z.object({
      value: z.number(),
      label: z.object({
        params: z.object({ type: z.object({ key: z.string() }) }),
      }),
    }),
  ),
});
const kpisBody = z.object({
  items: z.array(z.object({ id: z.string() }).passthrough()),
});

async function stats(client: AxiosInstance) {
  const storage = readBody(
    await client.get("/api/media/stats/storage"),
    storageBody,
  );
  const segment = (type: string) =>
    storage.segments.find(
      (entry) => entry.label.params.type.key === `dms_media.types.${type}`,
    )?.value ?? 0;
  const attention = readBody(
    await client.get("/api/media/stats/attention"),
    attentionBody,
  );
  const figure = (id: string) =>
    attention.items.find((entry) => entry.id === id)?.value ?? 0;
  return {
    used: storage.value,
    segmentSum: storage.segments.reduce((sum, entry) => sum + entry.value, 0),
    pdf: segment("pdf"),
    image: segment("image"),
    failedUploads: figure("failed-uploads"),
    largeFiles: figure("large-files"),
  };
}

describe("[integration] media overview — storage plan and exact figures", () => {
  let client: AxiosInstance;
  let folderId: string;

  before(async function () {
    this.timeout(30_000);
    client = authorizedClient((await ensureOwnerSession()).accessToken);
    folderId = readBody(
      await client.post("/api/media/folders", { name: "Overview plan" }),
      createdBody,
    ).id;
  });

  after(async () => {
    await client.delete(`/api/media/folders/${folderId}`);
  });

  it("names the storage plan on the storage KPI and gives its quota in the tree only when one is set", async () => {
    const freshStorageItem = async () => {
      const touched = await client.post("/api/media/folders", {
        name: "Overview plan touch",
      });
      await client.delete(
        `/api/media/folders/${readBody(touched, createdBody).id}`,
      );
      return JSON.stringify(
        readBody(
          await client.get("/api/media/stats/kpis"),
          kpisBody,
        ).items.find((item) => item.id === "storage"),
      );
    };
    const quota = async () =>
      readBody(
        await client.get("/api/media/tree"),
        z.object({ quotaBytes: z.number().nullable() }),
      ).quotaBytes;
    expect(await freshStorageItem()).not.to.contain("storage_quota_detail");
    expect(await quota()).to.equal(null);
    await withMediaConfig({ storageQuotaBytes: PLAN_BYTES }, async () => {
      expect(await freshStorageItem()).to.contain("storage_quota_detail");
      expect(await quota()).to.equal(PLAN_BYTES);
    });
  });

  it("counts exactly the failed uploads of today, the files over 20 MB and each type's bytes, the original of an edited image included", async function () {
    this.timeout(120_000);
    const before = await stats(client);
    const upload = (name: string, size: number) =>
      uploadAsset(
        client,
        folderId,
        name,
        "application/pdf",
        Buffer.alloc(size, 37),
      );
    await upload("pile.pdf", LARGE_FILE_BYTES);
    await upload("plus.pdf", LARGE_FILE_BYTES + 1);
    const photoBytes = await solidPng(300, 200);
    const photo = await uploadAsset(
      client,
      folderId,
      "photo.png",
      "image/png",
      photoBytes,
    );
    const edited = await client.post(
      `/api/media/assets/${photo.id}/transform`,
      {
        rotate: 90,
      },
    );
    expect(edited.status).to.equal(HTTP_OK);
    for (const failed of [2, 1]) {
      const report = await client.post("/api/media/upload/batches", {
        batchId: `figures-${failed}`,
        folderId,
        total: failed + 1,
        uploaded: 1,
        failed,
        size: 1,
        failures: Array.from({ length: failed }, (_, index) => ({
          name: `f${index}.html`,
          reason: "type_not_allowed",
        })),
      });
      expect(report.status).to.equal(HTTP_OK);
    }
    const after = await stats(client);
    expect(after.failedUploads - before.failedUploads).to.equal(3);
    expect(after.largeFiles - before.largeFiles).to.equal(1);
    expect(after.pdf - before.pdf).to.equal(2 * LARGE_FILE_BYTES + 1);
    expect(after.image - before.image).to.equal(
      readBody(edited, z.object({ asset: z.object({ size: z.number() }) }))
        .asset.size + photoBytes.byteLength,
    );
    expect(after.used).to.equal(after.segmentSum);
  });

  it("accepts a file that fills the storage plan to the byte and refuses one more byte with nothing remaining", async () => {
    const { used } = await stats(client);
    await withMediaConfig(
      { storageQuotaBytes: used + FILL_BYTES },
      async () => {
        await uploadAsset(
          client,
          folderId,
          "remplit.txt",
          TEXT_MIMETYPE,
          Buffer.alloc(FILL_BYTES, 97),
        );
        const more = await client.post("/api/media/upload/presign", {
          folderId,
          filename: "octet.txt",
          size: 1,
          mimetype: TEXT_MIMETYPE,
        });
        expect(more.status).to.equal(HTTP_PAYLOAD_TOO_LARGE);
        expect(more.data).to.include({ reason: "quota", remaining: 0 });
      },
    );
  });
});
