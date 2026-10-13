import type { MaybeRefOrGetter } from 'vue'

/**
 * Overlays that hold the keyboard: an open modal dialog or menu. A non-modal
 * dialog without a state, like the dashboard's "Star on GitHub" prompt, does
 * not count.
 */
const OVERLAY_SELECTOR = [
	'[role="dialog"][data-state="open"]',
	'[role="dialog"][aria-modal="true"]',
	'[role="alertdialog"][data-state="open"]',
	'[role="menu"][data-state="open"]',
].join(', ')

const openOverlays = shallowRef<Element[]>([])
let observer: MutationObserver | undefined
let users = 0

function refresh(): void {
	openOverlays.value = Array.from(document.querySelectorAll(OVERLAY_SELECTOR))
}

/**
 * Whether a dialog or a menu is open on the page: page shortcuts stand down
 * while one is, so Escape, Enter and Space reach the overlay. An overlay that
 * holds the given element, like the picker holding its explorer, does not
 * count for it.
 */
export function useOverlayPresence(host?: MaybeRefOrGetter<Element | null | undefined>) {
	onMounted(() => {
		users += 1
		if (!observer) {
			observer = new MutationObserver(refresh)
			observer.observe(document.body, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: ['data-state', 'aria-modal'],
			})
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
	const isOverlayOpen = computed(() => {
		const element = toValue(host)
		return openOverlays.value.some((overlay) => !element || !overlay.contains(element))
	})
	return { isOverlayOpen }
}

type ShortcutMap = Record<string, unknown>

/** Page shortcuts that turn off while a dialog or a menu is open over the host. */
export function definePageShortcuts(
	shortcuts: () => ShortcutMap,
	host?: MaybeRefOrGetter<Element | null | undefined>,
): void {
	const { isOverlayOpen: isOpen } = useOverlayPresence(host)
	defineShortcuts(computed(() => (isOpen.value ? {} : shortcuts())) as never)
}
