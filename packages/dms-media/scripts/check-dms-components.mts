import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";

/**
 * Every `Dms…` and `dms-…` component tag in the module's `.vue` templates
 * names a component the installed `@antelopejs/dms` registers or one this
 * module registers itself. Vue leaves an unknown tag unrendered without an
 * error, so a component renamed upstream only shows as a missing part of a
 * screen. Prints the violations only; exits 1 when there are any.
 */

const PACKAGE = join(import.meta.dirname, "..");
const FRONTENDS = [
  join(PACKAGE, "frontend-vue"),
  join(PACKAGE, "playground", "frontend-vue"),
];
const DMS_FRONTEND = join(
  realpathSync(join(PACKAGE, "node_modules", "@antelopejs", "dms")),
  "frontend-vue",
);
const OWN_COMPONENTS = join(PACKAGE, "frontend-vue", "app", "components");
/** The `componentPrefix` of `@antelopejs/dms`'s frontend module. */
const DMS_PREFIX = "Dms";
/** The `componentPrefix` of this module's frontend, in `frontend-vue/dms.frontend.ts`. */
const OWN_PREFIX = "DmsMedia";
const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", ".dms"]);
/** A directory whose `.vue` files `@antelopejs/dms` registers as components. */
const COMPONENT_DIRECTORY = /\/(?:build\/)?components(?:\/|$)/;
const PASCAL_TAG = /<(Dms[A-Z][\w]*)/g;
const KEBAB_TAG = /<(dms-[a-z0-9-]+)/g;
const TEMPLATE = /<template[\s>][\s\S]*<\/template>/;

function vueFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (SKIPPED_DIRECTORIES.has(entry.name)) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return vueFiles(path);
    return entry.name.endsWith(".vue") ? [path] : [];
  });
}

function pascalCase(name: string): string {
  return name
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function dmsComponents(): Set<string> {
  const layers = join(DMS_FRONTEND, "layers");
  return new Set(
    vueFiles(layers)
      .filter((file) =>
        COMPONENT_DIRECTORY.test(relative(layers, file).split(sep).join("/")),
      )
      .map((file) => DMS_PREFIX + pascalCase(basename(file, ".vue"))),
  );
}

function ownComponents(): Set<string> {
  return new Set(
    readdirSync(OWN_COMPONENTS)
      .filter((name) => name.endsWith(".vue"))
      .map((name) => OWN_PREFIX + pascalCase(basename(name, ".vue"))),
  );
}

function usedTags(source: string): string[] {
  const template = TEMPLATE.exec(source)?.[0] ?? "";
  return [
    ...[...template.matchAll(PASCAL_TAG)].map((match) => match[1] ?? ""),
    ...[...template.matchAll(KEBAB_TAG)].map((match) =>
      pascalCase(match[1] ?? ""),
    ),
  ];
}

const known = new Set([...dmsComponents(), ...ownComponents()]);
for (const file of FRONTENDS.flatMap(vueFiles)) {
  for (const tag of new Set(usedTags(readFileSync(file, "utf8")))) {
    if (known.has(tag)) continue;
    console.error(
      `${relative(PACKAGE, file)}: <${tag}> is no component @antelopejs/dms or this module registers`,
    );
    process.exitCode = 1;
  }
}
