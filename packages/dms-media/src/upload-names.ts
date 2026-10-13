const EXTENSION_SEPARATOR = ".";
const COPY_SUFFIX = /^(.*) \((\d+)\)$/;
const FIRST_COPY_NUMBER = 2;

interface NameParts {
  stem: string;
  extension: string;
  copy: number;
}

function splitName(filename: string): NameParts {
  const dot = filename.lastIndexOf(EXTENSION_SEPARATOR);
  const hasExtension = dot > 0;
  const base = hasExtension ? filename.slice(0, dot) : filename;
  const extension = hasExtension ? filename.slice(dot) : "";
  const match = COPY_SUFFIX.exec(base);
  if (!match) return { stem: base, extension, copy: FIRST_COPY_NUMBER - 1 };
  return { stem: match[1] ?? base, extension, copy: Number(match[2]) };
}

function nameKey(filename: string): string {
  return filename.trim().toLowerCase();
}

function nextFreeName(filename: string, taken: Set<string>): string {
  const { stem, extension, copy } = splitName(filename);
  let number = Math.max(copy + 1, FIRST_COPY_NUMBER);
  let candidate = `${stem} (${number})${extension}`;
  while (taken.has(nameKey(candidate))) {
    number += 1;
    candidate = `${stem} (${number})${extension}`;
  }
  return candidate;
}

/**
 * For each incoming name, the free name "Keep both" would use when the folder
 * (or an earlier file of the same batch) already holds it, ignoring case;
 * `null` when the name is free.
 */
export function suggestFreeNames(
  existing: string[],
  incoming: string[],
): (string | null)[] {
  const taken = new Set(existing.map(nameKey));
  return incoming.map((filename) => {
    if (!taken.has(nameKey(filename))) {
      taken.add(nameKey(filename));
      return null;
    }
    const free = nextFreeName(filename, taken);
    taken.add(nameKey(free));
    return free;
  });
}
