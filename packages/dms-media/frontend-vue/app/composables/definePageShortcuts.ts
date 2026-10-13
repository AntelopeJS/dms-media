import { useActiveElement } from '@vueuse/core'
import type { MaybeRefOrGetter } from 'vue'

type ShortcutMap = Record<string, unknown>

/**
 * Page shortcuts that stand down while the keyboard is in a dialog or a menu,
 * so Escape, Enter and Space reach the overlay. An overlay that holds the
 * given element, like the picker holding its explorer, does not count for it.
 */
export function definePageShortcuts(
	shortcuts: () => ShortcutMap,
	host?: MaybeRefOrGetter<Element | null | undefined>,
): void {
	const activeElement = useActiveElement()
	const isInOverlay = computed(() => {
		const active = activeElement.value
		return (
			isFocusInsideOverlay(active) && !toValue(host)?.contains(active ?? null)
		)
	})
	defineShortcuts(
		computed(() => (isInOverlay.value ? {} : shortcuts())) as never,
	)
}
