import type {
  ComposedText,
  ComposedTextParam,
} from "@antelopejs/interface-dms/base/types";

const KEY_PREFIX = "$";
const BYTES_PER_UNIT = 1024;
const BYTE_UNITS = ["b", "kb", "mb", "gb", "tb"];
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

/** A byte size in its largest whole unit ("3.2 MB"), its number written for the locale. */
export function composedBytes(bytes: number): ComposedText {
  let value = Math.max(bytes, 0);
  let unit = 0;
  while (value >= BYTES_PER_UNIT && unit < BYTE_UNITS.length - 1) {
    value /= BYTES_PER_UNIT;
    unit += 1;
  }
  const hasFraction = unit > 0 && value < SINGLE_FRACTION_DIGIT_BELOW;
  const rounded = hasFraction
    ? Math.round(value * ONE_FRACTION_DIGIT_FACTOR) / ONE_FRACTION_DIGIT_FACTOR
    : Math.round(value);
  return composedText(`${UNITS_TEXTS}.${BYTE_UNITS[unit]}`, {
    value: { type: "number", value: rounded },
  });
}
