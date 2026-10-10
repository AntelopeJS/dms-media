const OVERLAY_SELECTOR = '[role="dialog"], [role="alertdialog"], [role="menu"]'

const isOverlayOpen = ref(false)
let observer: MutationObserver | undefined
let users = 0

function refresh(): void {
	isOverlayOpen.value = document.querySelector(OVERLAY_SELECTOR) !== null
}

/**
 * Whether a dialog or a menu is open on the page: page shortcuts stand down
 * while one is, so Escape, Enter and Space reach the overlay.
 */
export function useOverlayPresence() {
	onMounted(() => {
		users += 1
		if (!observer) {
			observer = new MutationObserver(refresh)
			observer.observe(document.body, { childList: true, subtree: true })
		}
		refresh()
	})
	onBeforeUnmount(() => {
		users -= 1
		if (users === 0) {
			observer?.disconnect()
			observer = undefined
		}
	})
	return { isOverlayOpen: readonly(isOverlayOpen) }
}

type ShortcutMap = Record<string, unknown>

/** Page shortcuts that turn off while a dialog or a menu is open. */
export function definePageShortcuts(shortcuts: () => ShortcutMap): void {
	const { isOverlayOpen: isOpen } = useOverlayPresence()
	defineShortcuts(computed(() => (isOpen.value ? {} : shortcuts())) as never)
}
