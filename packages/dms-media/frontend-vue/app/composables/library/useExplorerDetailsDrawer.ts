import type { ContainerInstance } from '#dms-ui/app/composables/containers/types'
import ExplorerDetailsDrawer from '../../components/explorer/ExplorerDetailsDrawer.vue'
import type { ExplorerContext } from './useExplorerCommands'
import type { ExplorerLayout } from './useExplorerLayout'

/**
 * Below the width that keeps the details beside the files, shows them in the
 * DMS drawer while `layout.isDetailsDrawerOpen` is on. The drawer reads the
 * explorer's own library, so it follows the selection; closing it turns the
 * state off, and a wider explorer puts it away until it narrows again.
 */
export function useExplorerDetailsDrawer(layout: ExplorerLayout, context: ExplorerContext): void {
	const { open } = useDrawer()
	const { t } = useI18n()
	let drawer: ContainerInstance | null = null

	function show(): void {
		if (drawer) return
		const instance = open({
			direction: 'right',
			title: t('dms_media.explorer.details'),
			component: ExplorerDetailsDrawer,
			// Raw: the overlay keeps its props reactive, which would unwrap the library's refs.
			componentOptions: { context: markRaw({ ...context }) },
		})
		drawer = instance
		void instance.result.finally(() => {
			if (drawer !== instance) return
			drawer = null
			layout.isDetailsDrawerOpen.value = false
		})
	}

	function hide(): void {
		const instance = drawer
		drawer = null
		instance?.close()
	}

	const isShown = computed(() => layout.isDetailsDrawerOpen.value && !layout.hasInlineDetails.value)
	watch(isShown, (shown) => (shown ? show() : hide()))
	// The explorer goes (a page left, a picker closed): its drawer with it.
	onScopeDispose(hide)
}
