import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { DefaultDisplays } from "@antelopejs/interface-dms/base/table-view/column-display";
import { ButtonVariant } from "@antelopejs/interface-dms/base/types/button";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { MEDIA_ROUTES } from "../library/links";
import { libraryCategory, MEDIA_MODULE_ID } from "./module";
import { blockMeta } from "./texts";
import { uploadAvailability } from "./upload-availability";
import { MEDIA_LIBRARY_TOPIC } from "../constants";

const TEXTS = "$dms_media.uploads";
const HISTORY_PAGE_SIZE = 10;
const NEEDS_ATTENTION = "yes";

const history = TableView.fromSource({
  caption: `${TEXTS}.history.title`,
  fetchUrl: "/api/media/upload/batches",
  realtimeTopic: MEDIA_LIBRARY_TOPIC,
  layout: "full",
  density: "compact",
  pageSize: HISTORY_PAGE_SIZE,
  rowClick: "single",
  capabilities: { filter: true },
  tabs: [
    {
      id: "failed",
      label: `${TEXTS}.history.tab_failed`,
      icon: "i-ph-warning-circle",
      filter: { accessorKey: "attention", mode: "is", value: NEEDS_ATTENTION },
    },
  ],
  rowActions: {
    custom: [
      {
        label: `${TEXTS}.history.open_folder`,
        icon: "i-ph-folder-open",
        target: {
          type: "page",
          url: `${MEDIA_ROUTES.files}?folder={folderId}`,
        },
        isDefault: true,
      },
    ],
  },
  emptyStates: {
    firstRun: {
      title: `${TEXTS}.history.empty`,
      description: `${TEXTS}.history.empty_description`,
    },
  },
  columns: {
    folder: {
      name: `${TEXTS}.history.folder`,
      type: new DefaultDataTypes.StringType(),
      display: new DefaultDisplays.TwoLineDisplay({ subField: "byLine" }),
      order: 1,
    },
    files: {
      name: `${TEXTS}.history.files`,
      type: new DefaultDataTypes.NumberType(),
      order: 3,
      sortable: true,
    },
    size: {
      name: `${TEXTS}.history.size`,
      type: new DefaultDataTypes.NumberType(),
      display: new DefaultDisplays.TwoLineDisplay({
        primaryField: "sizeLabel",
      }),
      order: 4,
      sortable: true,
    },
    result: {
      name: `${TEXTS}.history.result`,
      type: new DefaultDataTypes.SelectType({
        items: [
          { value: "complete", label: `${TEXTS}.history.complete` },
          { value: "partial", label: `${TEXTS}.history.partial` },
          { value: "failed", label: `${TEXTS}.history.failed` },
        ],
      }),
      display: new DefaultDisplays.StatusPillDisplay({
        tones: { complete: "success", partial: "warning", failed: "error" },
        subField: "resultDetail",
      }),
      filterable: true,
      order: 5,
    },
    attention: {
      name: `${TEXTS}.history.attention`,
      type: new DefaultDataTypes.StringType(),
      isVisible: false,
      filterable: true,
      order: 7,
    },
    finishedAt: {
      name: `${TEXTS}.history.finished`,
      type: new DefaultDataTypes.DateType(),
      display: new DefaultDisplays.RelativeDateDisplay({}),
      order: 6,
      sortable: true,
    },
  },
}).meta(blockMeta("upload_history", "i-ph-clock-counter-clockwise"));

@RegisterPage()
export class MediaUploadsPage extends PageController(
  "uploads",
  {
    displayName: `${TEXTS}.title`,
    description: `${TEXTS}.description`,
    category: libraryCategory,
    module: MEDIA_MODULE_ID,
    icon: "i-ph-cloud-arrow-up",
    order: 2,
  },
  DefaultLayout({
    headerActions: [
      {
        id: "upload",
        availability: uploadAvailability,
        label: `${TEXTS}.upload`,
        icon: "i-ph-upload-simple",
        variant: ButtonVariant.solid,
        color: "primary",
        target: { type: "page", url: `${MEDIA_ROUTES.uploads}?pick=1` },
      },
    ],
  }),
) {
  static queue = CustomComponent("DmsMediaUploadQueue").meta(
    blockMeta("upload_queue", "i-ph-cloud-arrow-up"),
  );

  static history = history;
}
