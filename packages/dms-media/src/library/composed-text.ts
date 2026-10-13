import type {
  ComposedText,
  ComposedTextParam,
} from "@antelopejs/interface-dms/base/types";

const KEY_PREFIX = "$";
/** Decimal units, as the dashboard writes sizes: 1 kB is 1,000 bytes. */
const BYTES_PER_UNIT = 1000;
const BYTE_UNITS = ["b", "kb", "mb", "gb", "tb"] as const;
const SINGLE_FRACTION_DIGIT_BELOW = 10;
const ONE_FRACTION_DIGIT_FACTOR = 10;
const UNITS_TEXTS = "dms_media.units";

/** A text the dashboard writes in the reader's language from a key and raw values. */
export function composedText(
  key: string,
  params?: Record<string, ComposedTextParam>,
): ComposedText {
  const bareKey = key.startsWith(KEY_PREFIX) ? key.slice(1) : key;
  return params ? { key: bareKey, params } : { key: bareKey };
}

/** A count: written for the locale, and the number that picks the plural form. */
export function countParam(value: number): ComposedTextParam {
  return { type: "count", value };
}

/** A number written for the locale, without picking a plural form. */
export function numberParam(value: number): ComposedTextParam {
  return { type: "number", value };
}

export type ByteUnit = (typeof BYTE_UNITS)[number];

export interface ScaledBytes {
  /** Rounded to one decimal below 10 units, to a whole number otherwise. */
  value: number;
  unit: ByteUnit;
}

/** A byte size in its largest whole decimal unit: 3,240,000 bytes is 3.2 mb. */
export function scaleBytes(bytes: number): ScaledBytes {
  let value = Math.max(bytes, 0);
  let unitIndex = 0;
  while (value >= BYTES_PER_UNIT && unitIndex < BYTE_UNITS.length - 1) {
    value /= BYTES_PER_UNIT;
    unitIndex += 1;
  }
  const hasFraction = unitIndex > 0 && value < SINGLE_FRACTION_DIGIT_BELOW;
  const rounded = hasFraction
    ? Math.round(value * ONE_FRACTION_DIGIT_FACTOR) / ONE_FRACTION_DIGIT_FACTOR
    : Math.round(value);
  return { value: rounded, unit: BYTE_UNITS[unitIndex] };
}

/** A byte size in its largest whole unit ("3.2 MB"), its number written for the locale. */
export function composedBytes(bytes: number): ComposedText {
  const { value, unit } = scaleBytes(bytes);
  return composedText(`${UNITS_TEXTS}.${unit}`, {
    value: { type: "number", value },
  });
}
