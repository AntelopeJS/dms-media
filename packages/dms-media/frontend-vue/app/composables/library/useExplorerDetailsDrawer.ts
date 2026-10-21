import type { DrawerInstance, DrawerRowHeader } from '#dms-ui/app/composables/containers/types'
import ExplorerDetailsDrawer from '../../components/explorer/ExplorerDetailsDrawer.vue'
import type { ExplorerContext } from './useExplorerCommands'
import type { ExplorerLayout } from './useExplorerLayout'

/**
 * Below the width that keeps the details beside the files, shows them in the
 * DMS drawer while `layout.isDetailsDrawerOpen` is on. The drawer reads the
 * explorer's own library, so it follows the selection; closing it turns the
 * state off, and a wider explorer puts it away until it narrows again.
 *
 * On a single file, the DMS's row header names it with its place among the
 * files shown: previous / next (and J / K) select the neighbouring file, as
 * the arrows do in the explorer.
 */
export function useExplorerDetailsDrawer(layout: ExplorerLayout, context: ExplorerContext): void {
	const { open } = useDrawer()
	const { t } = useI18n()
	const { listing, selection } = context.library
	let drawer: DrawerInstance | null = null

	function selectAt(index: number): void {
		const target = listing.assets.value[index]
		if (target) selection.select(target.id, { extend: false, toggle: false })
	}

	/** The focused file's header; the drawer's own title on a folder, several files or none. */
	const rowHeader = computed<DrawerRowHeader>(() => {
		const asset = selection.focusedAsset.value
		const assets = listing.assets.value
		const index = asset ? assets.findIndex((entry) => entry.id === asset.id) : -1
		if (!asset || index < 0) return {}
		return {
			title: asset.name,
			navigation: {
				index,
				total: assets.length,
				hasPrev: index > 0,
				hasNext: index < assets.length - 1,
				prev: () => selectAt(index - 1),
				next: () => selectAt(index + 1),
			},
		}
	})

	function show(): void {
		if (drawer) return
		const instance = open({
			direction: 'right',
			title: t('dms_media.explorer.details'),
			// Its body injects the explorer's library and commands: call this in
			// the setup of the component that provides them.
			component: ExplorerDetailsDrawer,
			rowHeader: rowHeader.value,
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
	watch(rowHeader, (header) => drawer?.patch({ rowHeader: header }))
	// The explorer goes (a page left, a picker closed): its drawer with it.
	onScopeDispose(hide)
}
