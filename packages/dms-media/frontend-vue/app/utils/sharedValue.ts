/** The value every entry holds, or `undefined` when they differ. */
export function sharedValue<Value>(values: Value[]): Value | undefined {
  return new Set(values).size === 1 ? values[0] : undefined;
}
