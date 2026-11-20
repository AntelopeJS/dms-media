import type { MediaEventKind } from "../../library/events";
import { channelTrigger, TriggerChannel } from "../channel";
import type { CommonFields } from "../recorded";

const DEFAULT_THRESHOLD_PERCENT = 90;

export interface StorageThresholdConfig {
  tenantId?: string;
  percent?: number;
}

export type StorageThresholdPayload = CommonFields & {
  percent: number;
  thresholdBytes: number;
  usedBytes: number;
  quotaBytes: number;
  usedPercent: number;
  triggeringKind: MediaEventKind;
};

/** The threshold a subscription watches. */
export function thresholdPercentOf(config: StorageThresholdConfig): number {
  return config.percent ?? DEFAULT_THRESHOLD_PERCENT;
}

export const storageThresholdChannel = new TriggerChannel<
  StorageThresholdConfig,
  StorageThresholdPayload
>(
  "media.storage-threshold",
  (config, event) => thresholdPercentOf(config) === event.payload.percent,
  "delivered",
);

export const storageThresholdTrigger = channelTrigger(storageThresholdChannel, {
  name: "Storage plan almost full",
  description:
    "Fires once when a tenant's media library crosses a percentage of its storage plan. Fires again only after usage has dropped 5 points below it. Never fires when no storage plan is configured. A crossing a procedure caused fires too.",
  icon: "i-lucide-hard-drive",
  configProperties: {
    percent: {
      type: "integer",
      minimum: 1,
      maximum: 100,
      default: DEFAULT_THRESHOLD_PERCENT,
      description: "Threshold, as a percentage of the storage plan.",
    },
  },
  outputProperties: {
    percent: { type: "number", description: "Configured threshold" },
    thresholdBytes: { type: "number" },
    usedBytes: {
      type: "number",
      description: "Bytes stored after the write, edited originals included",
    },
    quotaBytes: { type: "number", description: "The storage plan" },
    usedPercent: { type: "number", description: "One decimal" },
    triggeringKind: {
      type: "string",
      enum: ["asset.upload", "asset.transform"],
    },
  },
});
