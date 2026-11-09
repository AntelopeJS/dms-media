import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Every route the HTTP surface of `docs/5.extending.md` names, as a
 * `` `METHOD /path` `` code span, must be served by a controller under
 * `src/routes`. Path parameter names and the query string do not count, so
 * `GET /api/media/folders/:id/assets` matches `@Get("/folders/:folderId/assets")`.
 * Prints the violations only; exits 1 when there are any.
 */

const PACKAGE_ROOT = join(import.meta.dirname, "..");
const DOC = join(PACKAGE_ROOT, "docs", "5.extending.md");
const ROUTES = join(PACKAGE_ROOT, "src", "routes");
const SECTION = /^## HTTP surface$(?<body>[\s\S]*?)(?=^## |(?![\s\S]))/m;
const DOCUMENTED =
  /`(?<method>GET|POST|PUT|PATCH|DELETE) (?<path>\/[^`?\s]*)(?:\?[^`]*)?`/g;
const CLASS =
  /class (?<name>\w+) extends (?:Controller\("(?<prefix>[^"]*)"\)|(?<base>\w+))/g;
const HANDLER = /@(?<method>Get|Post|Put|Patch|Delete)\("(?<path>[^"]*)"\)/g;

/** A route as `METHOD /path` with every path parameter written `:`. */
function routeKey(method: string, path: string): string {
  const normalized = path.replaceAll(/:\w+/g, ":").replace(/(?<=.)\/$/, "");
  return `${method.toUpperCase()} ${normalized}`;
}

const sources = readdirSync(ROUTES, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
  .map((entry) => readFileSync(join(entry.parentPath, entry.name), "utf8"));

const prefixes = new Map<string, string>();
const bases = new Map<string, string>();
for (const source of sources) {
  for (const match of source.matchAll(CLASS)) {
    const { name = "", prefix, base } = match.groups ?? {};
    if (prefix !== undefined) prefixes.set(name, prefix);
    if (base !== undefined) bases.set(name, base);
  }
}

function prefixOf(name: string): string | undefined {
  const own = prefixes.get(name);
  if (own !== undefined) return own;
  const base = bases.get(name);
  return base === undefined ? undefined : prefixOf(base);
}

const served = new Set<string>();
for (const source of sources) {
  const classes = [...source.matchAll(CLASS)];
  for (const handler of source.matchAll(HANDLER)) {
    const owner = classes.findLast(
      (match) => (match.index ?? 0) < (handler.index ?? 0),
    );
    const prefix = prefixOf(owner?.groups?.name ?? "");
    const { method = "", path = "" } = handler.groups ?? {};
    if (prefix !== undefined) served.add(routeKey(method, prefix + path));
  }
}

const text = readFileSync(DOC, "utf8");
const section = SECTION.exec(text);
const errors: string[] = [];
const body = section?.groups?.body ?? "";
const offset =
  (section?.index ?? 0) + text.slice(section?.index ?? 0).indexOf(body);
let documented = 0;
for (const match of body.matchAll(DOCUMENTED)) {
  documented += 1;
  const { method = "", path = "" } = match.groups ?? {};
  if (!served.has(routeKey(method, path))) {
    const line = text.slice(0, offset + (match.index ?? 0)).split("\n").length;
    errors.push(
      `${relative(PACKAGE_ROOT, DOC)}:${line}: ${match[0]} is not served by any controller in src/routes`,
    );
  }
}
if (documented === 0 || served.size === 0) {
  errors.push(
    `found ${documented} documented and ${served.size} served routes; the check would pass on nothing`,
  );
}
if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
}
