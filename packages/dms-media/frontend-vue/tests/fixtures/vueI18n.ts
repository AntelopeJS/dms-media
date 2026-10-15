// The renderer's `useI18n` wraps vue-i18n's; the tests stub `useI18n` itself.
export const useI18n = () => {
	throw new Error('vue-i18n is not available in these tests')
}
