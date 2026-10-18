import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { uploadAsset } from "../helpers/assets";
import { authorizedClient } from "../helpers/http";
import { createRole, registerMember } from "../helpers/members";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
const TEXT_MIMETYPE = "text/plain";
const BODY = Buffer.alloc(10, 1);
const BATCH_ID = "overview-retried-batch";

interface ModuleEntry {
  id: string;
  landingSlug: string;
  readout?: Array<{ text: string; tone?: string }>;
  status?: string;
}

interface BatchRow {
  _id: string;
  files: number;
  failed: number;
  result: string;
  attention: string;
}

interface ActivityRow {
  title: string;
  to?: string;
}

describe("[integration] media activity and overview — figures, upload history and module catalog", () => {
  let client: AxiosInstance;
  let folderId: string;

  before(async function () {
    this.timeout(30_000);
    const session = await ensureOwnerSession();
    client = authorizedClient(session.accessToken);
    folderId = (
      await client.post("/api/media/folders", { name: "Overview figures" })
    ).data.id;
  });

  after(async () => {
    await client.delete(`/api/media/folders/${folderId}`);
  });

  it("lands the catalog tile on the overview, with a readout", async () => {
    const response = await client.get("/dms/modules-listing");
    expect(response.status).to.equal(HTTP_OK);
    const entries: ModuleEntry[] = Array.isArray(response.data)
      ? response.data
      : response.data.modules;
    const media = entries.find((entry) => entry.id === "media");
    expect(media?.landingSlug).to.equal("/modules/media/overview");
    expect(media?.readout).to.have.length(2);
  });

  it("keeps the newest report of a retried batch only", async () => {
    await uploadAsset(client, folderId, "overview-a.txt", TEXT_MIMETYPE, BODY);
    const report = (uploaded: number, failed: number) =>
      client.post("/api/media/upload/batches", {
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
    expect((await report(1, 1)).status).to.equal(HTTP_OK);
    const failedOnly = await client.get("/api/media/upload/batches", {
      params: { filter_result: "is:partial,failed" },
    });
    expect(failedOnly.data.results.map((row: BatchRow) => row._id)).to.include(
      BATCH_ID,
    );
    expect((await report(2, 0)).status).to.equal(HTTP_OK);
    const all = await client.get("/api/media/upload/batches");
    const row = all.data.results.find(
      (entry: BatchRow) => entry._id === BATCH_ID,
    );
    expect(row).to.include({ failed: 0, result: "complete" });
    const stillFailed = await client.get("/api/media/upload/batches", {
      params: { filter_result: "is:partial,failed" },
    });
    expect(
      stillFailed.data.results.map((entry: BatchRow) => entry._id),
    ).to.not.include(BATCH_ID);
  });

  it("counts on the overview exactly the failures the history flags", async () => {
    const failingFolder = (
      await client.post("/api/media/folders", {
        name: "Overview failing uploads",
      })
    ).data.id;
    await client.post("/api/media/upload/batches", {
      batchId: "overview-failing-batch",
      folderId: failingFolder,
      total: 3,
      uploaded: 0,
      failed: 3,
      size: 0,
    });
    const flagged = async () => {
      const rows = await client.get("/api/media/upload/batches", {
        params: { filter_attention: "is:yes" },
      });
      return rows.data.results.reduce(
        (total: number, row: BatchRow) => total + row.failed,
        0,
      );
    };
    const counted = async () => {
      const attention = await client.get("/api/media/stats/attention");
      const item = attention.data.items.find(
        (entry: { id: string }) => entry.id === "failed-uploads",
      );
      return item?.value ?? 0;
    };
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
    const titles = response.data.items.map((item: ActivityRow) => item.title);
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
