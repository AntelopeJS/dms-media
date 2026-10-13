import type { ScheduledTask } from "node-cron";
import { schedulePurgeStaging } from "./purge-staging";
import { scheduleSweepStaleDerivatives } from "./sweep-derivatives";

export * from "./purge-staging";
export * from "./sweep-derivatives";

export function registerMediaCrons(): ScheduledTask[] {
  return [scheduleSweepStaleDerivatives(), schedulePurgeStaging()];
}
