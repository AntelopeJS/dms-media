import { defineDmsFrontendBuild } from '#dms/frontend-build'
import { backendBoundary } from './build/backend-boundary.ts'

/** The build of the frontend module: its auto-imports, and the backend boundary in every build. */
export default defineDmsFrontendBuild((build) => {
	build.registerAutoImports(['app/composables', 'app/utils'])
	build.registerVitePlugins(() => [backendBoundary()])
})
