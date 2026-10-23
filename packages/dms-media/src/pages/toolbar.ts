import { pageToolbar } from "@antelopejs/interface-dms/base/page-toolbar";
import type { PageLiveOptions } from "@antelopejs/interface-dms/page";
import { MEDIA_MODULE_ID } from "./module";
import { blockMeta } from "./texts";

/** Shortest interval, in seconds, between two refetches of a block while files upload. */
const LIVE_MAX_RATE_SECONDS = 2;

/**
 * Live mode of the media pages that follow the library as it changes. They
 * share one Direct / Pause choice: pausing the overview pauses the uploads too.
 */
export const MEDIA_LIVE: PageLiveOptions = {
  maxRate: LIVE_MAX_RATE_SECONDS,
  rememberKey: MEDIA_MODULE_ID,
};

/**
 * The DMS page toolbar of a live media page, first in its body: when the page
 * last read the library and Direct / Pause. No period: the library's figures
 * are a snapshot, not a window of time.
 */
export function mediaPageToolbar() {
  return pageToolbar({
    live: { missedLabel: "$dms_media.live.missed" },
    period: false,
  }).meta(blockMeta("page_toolbar", "i-ph-sliders-horizontal"));
}
