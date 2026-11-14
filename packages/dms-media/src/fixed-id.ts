import { createHash } from "node:crypto";

/**
 * An id derived from `parts`, the same in every process, so two processes
 * writing the row for the same parts write one row. Shaped as a version 8
 * UUID, like the ids the database gives other rows.
 */
export function fixedId(...parts: string[]): string {
  const hex = createHash("sha256").update(JSON.stringify(parts)).digest("hex");
  const variant = ((Number.parseInt(hex.charAt(16), 16) % 4) + 8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}
