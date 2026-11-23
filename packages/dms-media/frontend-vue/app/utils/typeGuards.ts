/** Whether a value read from storage, a request or a route is a string. */
export function isText(value: unknown): value is string {
  return typeof value === "string";
}

/** Whether a value read from storage, a request or a route is a number. */
export function isCount(value: unknown): value is number {
  return typeof value === "number";
}

/** Whether a value read from storage, a request or a route is a list of strings. */
export function isTextList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isText);
}
