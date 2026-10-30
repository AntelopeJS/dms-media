/** Replaces a prototype method with `wrap(original)` and returns the call that puts the original back. */
export function patchMethod<Owner extends object, Key extends keyof Owner>(
  owner: Owner,
  key: Key,
  wrap: (original: Owner[Key]) => Owner[Key],
): () => void {
  const original = owner[key];
  owner[key] = wrap(original);
  return () => {
    owner[key] = original;
  };
}
