/** Whether `value` is a string. */
export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** Whether `value` is a non-null object, arrays included. */
export function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

/** Whether `value` can carry properties of its own: a non-null object or a function. */
export function isObjectLike(value: unknown): value is object {
  return isObject(value) || isCallable(value);
}

/** Whether `typeof` reports `value` as a function: classes included, as TypeScript narrows it. */
export function isCallable(value: unknown): value is Function {
  return typeof value === "function";
}
