import { defineDmsFrontendBuild } from '#dms/frontend-build'

export default defineDmsFrontendBuild((build) => {
	build.registerAutoImports(['app/composables', 'app/utils'])
})
