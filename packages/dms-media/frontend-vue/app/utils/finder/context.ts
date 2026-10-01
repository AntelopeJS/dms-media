interface Options {
  contextName: string;
  providerName: string;
}

/**
 * Helper to inject a context into the component
 *
 * @param key - The injection key to use
 * @param options - The options to use (optional)
 * @returns The context
 * @throws An error if the context is not found
 */
export const injectContext = <T>(
  key: InjectionKey<T>,
  options?: Partial<Options>,
): T => {
  const context = inject<T>(key);

  if (context) return context;

  const { contextName = "context", providerName = "provider" } = options ?? {};

  throw new Error(`${contextName} must be used within a ${providerName}...`);
};
