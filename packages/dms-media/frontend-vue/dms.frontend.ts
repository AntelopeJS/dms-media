import { defineAsyncComponent, type Component } from 'vue'
import type { DmsFrontendModule } from '#dms/frontend-module'

interface VueModule {
	default: Component
}

const components = import.meta.glob<VueModule>([
	'./app/components/**/*.vue',
	'!./app/components/finder/**/*.vue',
])
const finderComponents = import.meta.glob<VueModule>(
	'./app/components/finder/**/*.vue',
)

function pascalCase(path: string): string {
	return path
		.replace(/(?:^|\/)index\.vue$/, '')
		.replace(/\.vue$/, '')
		.split(/[\/._-]+/)
		.filter(Boolean)
		.map((part) => part[0].toUpperCase() + part.slice(1))
		.join('')
}

const frontendModule: DmsFrontendModule = {
	setup(sdk) {
		for (const [path, loader] of Object.entries(components).sort()) {
			const name = pascalCase(path.split('/').at(-1)!)
			sdk.registerComponent(
				`DmsMedia${name}`,
				defineAsyncComponent(async () => (await loader()).default),
			)
		}
		for (const [path, loader] of Object.entries(finderComponents).sort()) {
			const name = pascalCase(path.replace('./app/components/finder/', ''))
			sdk.registerComponent(
				`Finder${name}`,
				defineAsyncComponent(async () => (await loader()).default),
			)
		}
	},
}

export default frontendModule
