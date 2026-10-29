import { assert, expect } from "chai";
import type { KeyValueListItem } from "@antelopejs/interface-dms/base/key-value-list";
import type { MediaAsset, MediaFolder } from "../../../db";
import { buildDeliveryPath } from "../../../routes/media/dto";
import {
  buildDeliveryLinks,
  buildDeliveryNotice,
  buildFileInformation,
} from "../../../routes/media/file";

const ORIGIN = "https://api.example.com";
const ASSET_ID = "7554eb0a-c6fb-4518-a8b9-65c6e8a3e6a9";

function jpeg(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    _id: ASSET_ID,
    name: "Été à Liège.jpg",
    mimetype: "image/jpeg",
    visibility: "inherit",
    folderId: "folder",
    createdAt: new Date("2026-10-01T10:00:00Z"),
    updatedAt: new Date("2026-10-02T10:00:00Z"),
    ...overrides,
  } as MediaAsset;
}

function folder(visibility: MediaFolder["visibility"]): MediaFolder {
  return { visibility } as MediaFolder;
}

function row(items: KeyValueListItem[], id: string): KeyValueListItem {
  const found = items.find((item) => item.id === id);
  assert.isDefined(found, id);
  return found;
}

describe("[unit] routes/file — delivery links", () => {
  it("copies every link on the origin it is given", () => {
    const items = buildDeliveryLinks(jpeg(), ORIGIN, false);
    const copied = items
      .filter((item) => item.copyValue)
      .map((item) => item.copyValue);
    expect(copied).to.have.length(3);
    copied.forEach((value) =>
      expect(value).to.match(/^https:\/\/api\.example\.com\/media\//),
    );
  });

  it("copies the stable link as the API origin followed by the file's url, as the explorer does", () => {
    const asset = jpeg();
    const stable = row(buildDeliveryLinks(asset, ORIGIN, false), "stable");
    expect(stable.copyValue).to.equal(`${ORIGIN}${buildDeliveryPath(asset)}`);
  });

  it("ends a size's link with the format it serves", () => {
    const items = buildDeliveryLinks(jpeg(), ORIGIN, false);
    expect(row(items, "thumb").value).to.equal(
      `/media/${ASSET_ID}/thumb/${encodeURIComponent("Été à Liège-thumb.webp")}`,
    );
    expect(row(items, "preview").value).to.match(/-preview\.webp$/);
  });

  it("names the built-in sizes and writes their dimensions for people", () => {
    const items = buildDeliveryLinks(jpeg(), ORIGIN, true);
    expect(row(items, "thumb").label).to.equal(
      "$dms_media.file.preset_names.thumb",
    );
    expect(row(items, "thumb").detail).to.equal("300 × 300");
    expect(row(items, "preview").detail).to.deep.include({
      key: "dms_media.file.preset_width",
    });
  });

  it("lists the id with the links, copyable, and no longer in the information", () => {
    const items = buildDeliveryLinks(jpeg(), ORIGIN, true);
    expect(items.map((item) => item.id)).to.deep.equal([
      "stable",
      "thumb",
      "preview",
      "asset-id",
      "presets",
    ]);
    expect(row(items, "asset-id")).to.include({ value: ASSET_ID, copy: true });
    const information = buildFileInformation(jpeg(), "Owner");
    expect(information.map((item) => item.id)).to.deep.equal([
      "uploaded",
      "modified",
      "type",
    ]);
  });

  it("only gives a document its stable link", () => {
    const pdf = jpeg({ name: "contrat.pdf", mimetype: "application/pdf" });
    const ids = buildDeliveryLinks(pdf, ORIGIN, false).map((item) => item.id);
    expect(ids).to.deep.equal(["stable", "asset-id"]);
  });
});

describe("[unit] routes/file — information", () => {
  it("writes the type as its group and extension rather than a mimetype", () => {
    const [, modified, type] = buildFileInformation(jpeg(), undefined);
    expect(type?.value).to.deep.equal({
      key: "dms_media.file.type_value",
      params: {
        group: { key: "dms_media.file.type_names.image" },
        extension: "JPG",
      },
    });
    expect(modified).to.include({
      type: "date",
      value: "2026-10-02T10:00:00.000Z",
    });
  });

  it("falls back on the mimetype for a name without extension", () => {
    const csv = jpeg({ name: "tarifs", mimetype: "text/csv" });
    const type = row(buildFileInformation(csv, undefined), "type");
    expect(type.value).to.deep.include({
      params: {
        group: { key: "dms_media.file.type_names.spreadsheet" },
        extension: "CSV",
      },
    });
  });
});

describe("[unit] routes/file — delivery notice", () => {
  it("points a private file to its visibility, without a button of its own", () => {
    const notice = buildDeliveryNotice(jpeg(), folder("private"));
    expect(notice.description).to.equal(
      "$dms_media.file.delivery_private_notice",
    );
    expect(notice.actions).to.equal(undefined);
  });

  it("tells a public file is served from the CDN", () => {
    const notice = buildDeliveryNotice(jpeg(), folder("public"));
    expect(notice.description).to.equal("$dms_media.file.delivery_public");
  });
});
