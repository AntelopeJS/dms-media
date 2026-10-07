import { defineAsyncComponent, type Component } from 'vue'
import type { DmsFrontendModule } from '#dms/frontend-module'

interface VueModule {
	default: Component
}

const blocks = import.meta.glob<VueModule>('./app/components/*.vue')

function componentName(path: string): string {
	return path
		.split('/')
		.at(-1)!
		.replace(/\.vue$/, '')
}

const frontendModule: DmsFrontendModule = {
	componentPrefix: 'DmsMedia',
	setup(sdk) {
		for (const [path, loader] of Object.entries(blocks).sort()) {
			sdk.registerComponent(
				componentName(path),
				defineAsyncComponent(async () => (await loader()).default),
			)
		}
	},
}

export default frontendModule
