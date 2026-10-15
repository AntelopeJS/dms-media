import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// The renderer and the DMS core layer the server-render tests run on: the
// ones the module installs (`@antelopejs/dms-frontend`, `@antelopejs/dms`),
// as `pnpm test:frontend` checks the module against them.
const root = resolve(__dirname, '..', 'node_modules', '@antelopejs')

export default defineConfig({
	plugins: [vue()],
	resolve: {
		alias: {
			'#dms/frontend-module': resolve(root, 'dms-frontend/templates/vue/frontend-module.ts'),
			'#dms-core': resolve(root, 'dms/frontend-vue/layers/dms-core'),
			'#dms-ui': resolve(root, 'dms/frontend-vue/layers/dms-ui'),
			// One Vue for the renderer and the components.
			vue: resolve(__dirname, 'node_modules/vue'),
			// What the renderer reads of Inertia, vue-i18n and unhead in the browser only.
			'@inertiajs/vue3': resolve(__dirname, 'tests/fixtures/inertia.ts'),
			'vue-i18n': resolve(__dirname, 'tests/fixtures/vueI18n.ts'),
			'@unhead/vue': resolve(__dirname, 'tests/fixtures/unhead.ts'),
		},
	},
	test: { environment: 'node', include: ['tests/**/*.test.ts'] },
})
