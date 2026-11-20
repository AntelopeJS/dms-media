import { expect } from "chai";
import {
  MEDIA_ACTIONS,
  MEDIA_DATA_NODES,
  MEDIA_TRIGGERS,
} from "../../../automation";
import { bindingFolderIdData } from "../../../automation/data/binding-folder-id";
import { dashboardLinkData } from "../../../automation/data/dashboard-link";
import { deliveryUrlData } from "../../../automation/data/delivery-url";
import { typeGroupData } from "../../../automation/data/type-group";
import { AutomationLoopGuard } from "../../../automation/loop-guard";
import { bindingFolderId, CONTENT_ROOT_BINDING } from "../../../bindings";

const READS = [
  "media.get-file",
  "media.create-read-url",
  "media.list-folder-files",
  "media.get-storage-usage",
  "media.search-files",
];

describe("[unit] media automation node set", () => {
  describe("registered node set", () => {
    it("declares the 5 triggers, 14 actions and 4 data nodes under media ids, each once", () => {
      const ids = [
        ...MEDIA_TRIGGERS,
        ...MEDIA_ACTIONS,
        ...MEDIA_DATA_NODES,
      ].map((node) => node.id);
      expect(new Set(ids).size).to.equal(23);
      expect(ids.every((id) => id.startsWith("media."))).to.equal(true);
      expect(MEDIA_TRIGGERS.map((trigger) => trigger.cluster)).to.deep.equal(
        Array(5).fill("replicated"),
      );
    });

    it("marks the five reads free of side effects and gives every write a dry run", () => {
      for (const action of MEDIA_ACTIONS) {
        const isRead = READS.includes(action.id);
        expect(action.sideEffects === false, action.id).to.equal(isRead);
        expect(action.dryRun === undefined, action.id).to.equal(isRead);
      }
    });

    it("offers includeAutomationWrites, off by default, on every trigger but storage-threshold, and origin outputs on all", () => {
      for (const trigger of MEDIA_TRIGGERS) {
        expect(
          trigger.configSchema.properties?.includeAutomationWrites?.default,
          trigger.id,
        ).to.equal(
          trigger.id === "media.storage-threshold" ? undefined : false,
        );
        expect(trigger.outputSchema.properties, trigger.id).to.include.keys(
          "originProcedureId",
          "originRunId",
          "deliveryId",
        );
      }
    });
  });
});

describe("[unit] media automation data nodes", () => {
  describe("media.delivery-url", () => {
    it("builds the canonical path, encoding the name, with and without an image size", () => {
      expect(
        deliveryUrlData.evaluate({ assetId: "a1", name: "Été #1.png" }),
      ).to.deep.equal({
        path: "/media/a1/%C3%89t%C3%A9%20%231.png",
        url: "/media/a1/%C3%89t%C3%A9%20%231.png",
      });
      expect(
        deliveryUrlData.evaluate({
          assetId: "a1",
          name: "a.png",
          preset: "thumb",
          origin: "https://api.example.com//",
        }),
      ).to.deep.equal({
        path: "/media/a1/thumb/a.png",
        url: "https://api.example.com/media/a1/thumb/a.png",
      });
    });

    it("fails on a missing name instead of building a broken link", () => {
      expect(() => deliveryUrlData.evaluate({ assetId: "a1" })).to.throw(
        /media.delivery-url: invalid input \(name/,
      );
    });
  });

  describe("media.dashboard-link", () => {
    it("builds file and folder links on the dashboard origin, empty for what is not given", () => {
      expect(
        dashboardLinkData.evaluate({
          assetId: "a 1",
          origin: "https://admin.example.com/",
        }),
      ).to.deep.equal({
        fileUrl: "https://admin.example.com/modules/media/file?asset=a%201",
        folderUrl: "",
      });
      expect(dashboardLinkData.evaluate({ folderId: "f1" })).to.deep.equal({
        fileUrl: "",
        folderUrl: "/modules/media/files?folder=f1",
      });
    });

    it("refuses neither a file nor a folder", () => {
      expect(() => dashboardLinkData.evaluate({})).to.throw(
        /media.dashboard-link/,
      );
    });
  });

  describe("media.type-group", () => {
    it("classifies like the library, SVG as an image that cannot be edited, ignoring case", () => {
      expect(typeGroupData.evaluate({ mimetype: "IMAGE/PNG" })).to.deep.equal({
        group: "image",
        isImage: true,
        isEditable: true,
      });
      expect(
        typeGroupData.evaluate({ mimetype: "image/svg+xml" }),
      ).to.deep.equal({
        group: "vector",
        isImage: true,
        isEditable: false,
      });
      expect(typeGroupData.evaluate({ mimetype: "text/csv" })).to.deep.equal({
        group: "spreadsheet",
        isImage: false,
        isEditable: false,
      });
    });
  });

  describe("media.binding-folder-id", () => {
    it("gives the id the tenant's linked folder is created under, the default tenant when empty", () => {
      expect(
        bindingFolderIdData.evaluate({ tenantId: "t1", binding: "blog.cover" }),
      ).to.deep.equal({ folderId: bindingFolderId("t1", "blog.cover") });
      expect(
        bindingFolderIdData.evaluate({ binding: CONTENT_ROOT_BINDING }),
      ).to.deep.equal({
        folderId: bindingFolderId("default", CONTENT_ROOT_BINDING),
      });
    });
  });

  describe("automation loop guard", () => {
    it("drops the sixth event of one subject within a minute, keeps other subjects, and admits again after the window", () => {
      const guard = new AutomationLoopGuard(5, 60_000);
      const admitted = Array.from({ length: 6 }, () => guard.admit("s", 0));
      expect(admitted).to.deep.equal([true, true, true, true, true, false]);
      expect(guard.admit("other", 0)).to.equal(true);
      expect(guard.admit("s", 60_001)).to.equal(true);
    });
  });
});
