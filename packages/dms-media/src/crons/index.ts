import type { ScheduledTask } from "node-cron";
import { scheduleSweepStaleDerivatives } from "./sweep-derivatives";

export * from "./sweep-derivatives";

export function registerMediaCrons(): ScheduledTask[] {
  return [scheduleSweepStaleDerivatives()];
}
