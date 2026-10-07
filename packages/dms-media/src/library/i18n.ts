import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const LOCALES_DIR = path.join(__dirname, "../../frontend-vue/i18n/locales");
const LOCALE_FILE_PATTERN = /^media-(.+)\.json$/;
const DEFAULT_LOCALE = "en-GB";
const KEY_PREFIX = "$";
const PLURAL_SEPARATOR = " | ";
const PARAM_PATTERN = /\{\s*(?:'([^']*)'|(\w+))\s*\}/g;
const PLURAL_FORMS_WITH_ZERO = 3;
const BYTES_PER_UNIT = 1024;
const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];
const SINGLE_FRACTION_DIGIT_BELOW = 10;

type MessageTree = { [key: string]: string | MessageTree };
type MessageParams = Record<string, string | number>;

export interface MediaTranslator {
  locale: string;
  t: (key: string, params?: MessageParams) => string;
  formatNumber: (value: number) => string;
  formatBytes: (bytes: number) => string;
}

let catalogs: Map<string, MessageTree> | undefined;

function loadCatalogs(): Map<string, MessageTree> {
  const loaded = new Map<string, MessageTree>();
  for (const file of readdirSync(LOCALES_DIR)) {
    const locale = LOCALE_FILE_PATTERN.exec(file)?.[1];
    if (!locale) continue;
    const content = readFileSync(path.join(LOCALES_DIR, file), "utf8");
    loaded.set(locale, JSON.parse(content) as MessageTree);
  }
  return loaded;
}

function getCatalogs(): Map<string, MessageTree> {
  catalogs ??= loadCatalogs();
  return catalogs;
}

/** Picks the catalog closest to a language tag (`fr`, `fr-BE`, `en-GB`). */
export function resolveLocale(language: string | undefined): string {
  const available = [...getCatalogs().keys()];
  if (!language) return DEFAULT_LOCALE;
  const normalized = language.toLowerCase();
  const exact = available.find((locale) => locale.toLowerCase() === normalized);
  if (exact) return exact;
  const base = normalized.split("-")[0];
  return (
    available.find((locale) => locale.toLowerCase().split("-")[0] === base) ??
    DEFAULT_LOCALE
  );
}

function lookup(
  tree: MessageTree | undefined,
  key: string,
): string | undefined {
  let node: string | MessageTree | undefined = tree;
  for (const segment of key.split(".")) {
    if (!node || typeof node === "string") return undefined;
    node = node[segment];
  }
  return typeof node === "string" ? node : undefined;
}

function selectPluralForm(message: string, params: MessageParams): string {
  const forms = message.split(PLURAL_SEPARATOR);
  if (forms.length === 1) return message;
  const count = Number(params.count ?? params.n ?? 0);
  const index =
    forms.length >= PLURAL_FORMS_WITH_ZERO
      ? Math.min(Math.max(count, 0), forms.length - 1)
      : count === 1
        ? 0
        : 1;
  return forms[index] ?? message;
}

function interpolate(message: string, params: MessageParams): string {
  return message.replace(PARAM_PATTERN, (match, literal, name) => {
    if (literal !== undefined) return literal;
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export function createMediaTranslator(language?: string): MediaTranslator {
  const locale = resolveLocale(language);
  const catalog = getCatalogs().get(locale);
  const fallback = getCatalogs().get(DEFAULT_LOCALE);
  const numberFormat = new Intl.NumberFormat(locale);
  const t = (key: string, params: MessageParams = {}): string => {
    const bare = key.startsWith(KEY_PREFIX) ? key.slice(1) : key;
    const message = lookup(catalog, bare) ?? lookup(fallback, bare);
    if (message === undefined) return bare;
    return interpolate(selectPluralForm(message, params), params);
  };
  const formatBytes = (bytes: number): string => {
    let value = Math.max(bytes, 0);
    let unit = 0;
    while (value >= BYTES_PER_UNIT && unit < BYTE_UNITS.length - 1) {
      value /= BYTES_PER_UNIT;
      unit += 1;
    }
    const digits = unit > 0 && value < SINGLE_FRACTION_DIGIT_BELOW ? 1 : 0;
    const formatted = new Intl.NumberFormat(locale, {
      maximumFractionDigits: digits,
    }).format(value);
    return `${formatted} ${BYTE_UNITS[unit]}`;
  };
  return {
    locale,
    t,
    formatNumber: (value) => numberFormat.format(value),
    formatBytes,
  };
}
