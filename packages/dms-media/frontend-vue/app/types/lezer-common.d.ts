/**
 * `@antelopejs/dms` 0.7.2 types its code highlighting with `@lezer/common`
 * without depending on it, and `ajs dms verify-source` installs each layer
 * strictly, so the import cannot resolve there. Remove this file with the DMS
 * release that declares the dependency.
 */
declare module '@lezer/common' {
	export type Parser = any
}
