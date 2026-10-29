import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Invariants of the frontend's locale catalogs: English and French declare the
 * same keys, each overview KPI detail fits one line of its card in both
 * languages, and every literal `t('dms_media.…')` key the layer uses has an
 * English message. Prints the violations only; exits 1 when there are any.
 */

type Messages = { [key: string]: string | Messages };

const PACKAGE = join(import.meta.dirname, "..");
const FRONTEND = join(PACKAGE, "frontend-vue");
const APP = join(FRONTEND, "app");
const LOCALES = join(FRONTEND, "i18n", "locales");
const LOCALE_NAMES = ["en-GB", "fr-FR"];
const KEY_PATTERN = /\bt\(\s*'(dms_media\.[a-z0-9_.-]+)'/g;
const SOURCE_FILE = /\.(vue|ts)$/;

/**
 * What one line of an overview KPI card holds at four columns (183px of 12px
 * text at 1440px wide): a detail on two lines makes the cards taller than their
 * skeleton, and every block below moves when they land.
 */
const KPI_DETAIL_MAX_LENGTH = 32;
const KPI_PREFIX = "dms_media.overview.kpis";
const KPI_DETAILS = [
  "files_detail",
  "storage_detail",
  "storage_quota_detail",
  "public_share",
  "missing_alt_none",
  "missing_alt_public",
];
const PLURAL_SEPARATOR = " | ";
const PLACEHOLDER = /\{(\w+)\}/g;
/** The widest values a detail is written with. */
const WIDEST_PARAMS = new Map([
  ["files", "99,999"],
  ["percent", "100"],
  ["quota", "100 GB"],
]);

function isMessageTree(value: unknown): value is Messages {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(isMessage)
  );
}

function isMessage(value: unknown): value is string | Messages {
  return typeof value === "string" || isMessageTree(value);
}

function isText(node: string | Messages): node is string {
  return typeof node === "string";
}

function readLocale(name: string): Messages {
  const file = join(LOCALES, `media-${name}.json`);
  const messages: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!isMessageTree(messages)) {
    throw new Error(
      `${relative(PACKAGE, file)}: not a tree of string messages`,
    );
  }
  return messages;
}

function messagesOf(tree: Messages, prefix = ""): Map<string, string> {
  return new Map(
    Object.entries(tree).flatMap(([key, node]) => {
      const path = `${prefix}${key}`;
      return isText(node) ? [[path, node]] : [...messagesOf(node, `${path}.`)];
    }),
  );
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, encoding: "utf8" })
    .filter((file) => SOURCE_FILE.test(file))
    .toSorted()
    .map((file) => join(directory, file));
}

function widest(form: string): string {
  return form.replace(
    PLACEHOLDER,
    (_, name: string) => WIDEST_PARAMS.get(name) ?? name,
  );
}

const locales = new Map(
  LOCALE_NAMES.map((name) => [name, messagesOf(readLocale(name))]),
);
const errors: string[] = [];

for (const [name, messages] of locales) {
  for (const [other, otherMessages] of locales) {
    for (const key of otherMessages.keys()) {
      if (!messages.has(key)) {
        errors.push(`${name}: missing key ${key}, which ${other} declares`);
      }
    }
  }
}

for (const [name, messages] of locales) {
  for (const detail of KPI_DETAILS) {
    const key = `${KPI_PREFIX}.${detail}`;
    const message = messages.get(key);
    if (message === undefined) {
      errors.push(`${name}: no message for ${key}`);
      continue;
    }
    for (const form of message.split(PLURAL_SEPARATOR).map(widest)) {
      if (form.length > KPI_DETAIL_MAX_LENGTH) {
        errors.push(
          `${name}: ${key} writes "${form}", longer than ${KPI_DETAIL_MAX_LENGTH} characters`,
        );
      }
    }
  }
}

const english = locales.get("en-GB") ?? new Map<string, string>();
for (const file of sourceFiles(APP)) {
  for (const [, key] of readFileSync(file, "utf8").matchAll(KEY_PATTERN)) {
    if (!english.has(key)) {
      errors.push(
        `en-GB: ${relative(PACKAGE, file)} asks for ${key}, which has no message`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
}
