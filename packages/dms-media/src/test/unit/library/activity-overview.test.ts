import { expect } from "chai";
import { buildActivityItems } from "../../../library/activity";
import {
  buildUploadBatches,
  countFailedUploads,
} from "../../../library/batches";
import { fileLink, folderLink } from "../../../library/links";
import {
  buildAttentionItems,
  buildKpiItems,
  buildStorageMeter,
  storedSize,
} from "../../../library/overview";
import {
  nextDailyRun,
  pickExampleImage,
  usesDefaultPresets,
} from "../../../library/presets-page";
import { DEFAULT_PRESETS } from "../../../presets";
import { asset, event, folder } from "./fixtures";

const folders = new Map([
  ["root", folder("root")],
  ["child", folder("child", "root", ["root"])],
]);

function at(minute: number): Date {
  return new Date(Date.UTC(2026, 0, 1, 10, minute));
}

function report(
  id: string,
  createdAt: Date,
  uploaded: number,
  failed: number,
  failures: unknown[] = [],
) {
  return event(id, {
    kind: "upload.batch",
    count: uploaded,
    createdAt,
    json_details: JSON.stringify({
      batchId: "b1",
      total: uploaded + failed,
      failed,
      failures: JSON.stringify(failures),
    }),
  });
}

function upload(id: string, createdAt: Date) {
  return event(id, {
    createdAt,
    assetId: id,
    size: 10,
    json_details: JSON.stringify({ batchId: "b1" }),
  });
}

describe("[unit] library/batches — upload history", () => {
  it("keeps only the newest report of a retried batch", () => {
    const events = [
      report("r2", at(5), 2, 0),
      upload("u2", at(4)),
      report("r1", at(3), 1, 1),
      upload("u1", at(2)),
    ];
    const [batch] = buildUploadBatches(events, folders);
    expect(batch).to.include({ files: 2, failed: 0, result: "complete" });
    expect(countFailedUploads(events, at(10))).to.equal(0);
  });

  it("counts a batch retried without success once", () => {
    const events = [report("r2", at(5), 0, 2), report("r1", at(3), 0, 2)];
    expect(countFailedUploads(events, at(10))).to.equal(2);
    const nextDay = new Date(at(10).getTime() + 25 * 60 * 60 * 1000);
    expect(countFailedUploads(events, nextDay)).to.equal(0);
    const [batch] = buildUploadBatches(events, folders, at(10));
    expect(batch?.attention).to.equal("yes");
    expect(buildUploadBatches(events, folders, nextDay)[0]?.attention).to.equal(
      "no",
    );
  });

  it("names the failed files and their reasons", () => {
    const events = [
      report("r1", at(3), 1, 1, [{ name: "big.tif", reason: "Too large" }]),
      upload("u1", at(2)),
    ];
    const [batch] = buildUploadBatches(events, folders);
    expect(batch?.resultDetail?.key).to.equal(
      "dms_media.uploads.history.failed_names",
    );
    expect(batch?.resultDetail?.params?.names).to.equal("big.tif (Too large)");
    expect(batch?.sizeLabel.key).to.equal("dms_media.units.b");
  });
});

describe("[unit] library/activity — feed", () => {
  it("folds a bulk move into one entry linking to its destination", () => {
    const moves = [1, 2, 3].map((minute) =>
      event(`m${minute}`, {
        kind: "asset.move",
        assetId: `a${minute}`,
        folderId: "child",
        createdAt: at(10 - minute),
        json_details: JSON.stringify({
          source: `s${minute}`,
          destination: "child",
        }),
      }),
    );
    const items = buildActivityItems(
      { events: moves, foldersById: folders },
      10,
    );
    expect(items).to.have.length(1);
    expect(items[0]?.params?.count).to.deep.equal({ type: "count", value: 3 });
    expect(items[0]?.to).to.equal(folderLink("child"));
  });

  it("keeps a file's own history entry by entry", () => {
    const alts = [1, 2].map((minute) =>
      event(`alt${minute}`, {
        kind: "asset.alt",
        assetId: "a1",
        createdAt: at(10 - minute),
      }),
    );
    const items = buildActivityItems(
      { events: alts, foldersById: folders, foldsBulkActions: false },
      10,
    );
    expect(items).to.have.length(2);
  });

  it("stops linking to a file that was deleted since", () => {
    const events = [
      event("d", { kind: "asset.delete", assetId: "a1", createdAt: at(5) }),
      event("r", { kind: "asset.rename", assetId: "a1", createdAt: at(4) }),
      event("k", { kind: "asset.rename", assetId: "a2", createdAt: at(3) }),
    ];
    const items = buildActivityItems({ events, foldersById: folders }, 10);
    expect(items.map((item) => item.to)).to.deep.equal([
      undefined,
      undefined,
      fileLink("a2"),
    ]);
    expect(items[1]?.meta).to.include("$dms_media.activity.deleted_marker");
  });

  it("links a created folder to itself", () => {
    const created = event("c", {
      kind: "folder.create",
      targetName: "child",
      folderId: "root",
      json_details: JSON.stringify({ targetId: "child" }),
    });
    const [item] = buildActivityItems(
      { events: [created], foldersById: folders },
      10,
    );
    expect(item?.to).to.equal(folderLink("child"));
    expect(item?.meta).to.deep.equal(["root › child"]);
    expect(item?.params).to.not.have.property("targetId");
  });

  it("words each visibility on its own", () => {
    const changed = event("v", {
      kind: "asset.visibility",
      assetId: "a1",
      json_details: JSON.stringify({
        visibility: "$dms_media.visibility.public",
      }),
    });
    const [item] = buildActivityItems(
      { events: [changed], foldersById: folders },
      10,
    );
    expect(item?.title).to.equal("$dms_media.activity.asset_visibility_public");
  });

  it("says a batch failed instead of saying it finished", () => {
    const [item] = buildActivityItems(
      { events: [report("r", at(1), 0, 1)], foldersById: folders },
      10,
    );
    expect(item?.title).to.equal("$dms_media.activity.upload_batch_failed");
    expect(item?.tone).to.equal("error");
  });

  it("stops linking to a folder that no longer exists", () => {
    const created = event("gone", {
      kind: "folder.create",
      targetName: "Archive",
      folderId: undefined,
      json_details: JSON.stringify({ targetId: "deleted-folder" }),
    });
    const [item] = buildActivityItems(
      { events: [created], foldersById: folders },
      10,
    );
    expect(item?.to).to.equal(undefined);
  });

  it("narrows the activity to one kind of action", () => {
    const events = [
      event("m", { kind: "asset.move", assetId: "a1", createdAt: at(3) }),
      event("d", { kind: "asset.delete", assetId: "a2", createdAt: at(2) }),
      event("u", { assetId: "a3", createdAt: at(1) }),
    ];
    const items = buildActivityItems(
      { events, foldersById: folders, filter: "deletions" },
      10,
    );
    expect(items.map((item) => item.title)).to.deep.equal([
      "$dms_media.activity.asset_delete",
    ]);
  });
});

describe("[unit] library/overview — figures", () => {
  const edited = asset("edited", {
    size: 3000,
    originalKey: "originals/edited.jpg",
    originalSize: 280000,
  });
  const input = {
    assets: [edited, asset("plain", { size: 1000, alt: "A plain photo" })],
    visibilityOf: () => "private" as const,
    now: new Date("2026-01-02"),
  };

  it("counts the original kept by an edit in the storage", () => {
    expect(storedSize(edited)).to.equal(283000);
    expect(buildStorageMeter(input).value).to.equal(284000);
  });

  it("links every figure somewhere", () => {
    expect(buildKpiItems(input).every((item) => Boolean(item.to))).to.equal(
      true,
    );
  });

  it("orders what needs attention, failures first, with action labels", () => {
    const items = buildAttentionItems({ ...input, failedUploads: 2 });
    expect(items.map((item) => item.id)).to.deep.equal([
      "failed-uploads",
      "missing-alt",
    ]);
    expect(items[0]?.to).to.equal("/modules/media/uploads?tab=failed");
  });
});

describe("[unit] library/presets-page — image sizes", () => {
  it("tells the default sizes from configured ones", () => {
    expect(usesDefaultPresets(DEFAULT_PRESETS)).to.equal(true);
    expect(usesDefaultPresets([{ id: "thumb", width: 10 }])).to.equal(false);
  });

  it("finds the next nightly run", () => {
    const now = new Date(2026, 0, 1, 5, 0);
    const next = nextDailyRun("0 4 * * *", now);
    expect(next.getDate()).to.equal(2);
    expect(next.getHours()).to.equal(4);
  });

  it("shows sizes on a photo, never on a vector", () => {
    const svg = asset("xss", {
      mimetype: "image/svg+xml",
      createdAt: at(5),
    });
    const photo = asset("photo", { mimetype: "image/png", createdAt: at(1) });
    expect(pickExampleImage([svg, photo], () => true)?._id).to.equal("photo");
    expect(pickExampleImage([svg], () => true)).to.equal(undefined);
  });
});
