import type { ExplorerHistory } from './useExplorerLayout'

/** Field of the browser's history entries that holds their place in the trail. */
const STATE_KEY = 'dmsMediaTrail'
/** The trail kept for the tab, so a reload (F5) keeps the explorer's arrows. */
const STORAGE_KEY = 'dms-media-trail'

interface StoredTrail {
	entries: string[]
	position: number
}

const entries = ref<string[]>([])
const position = ref(0)
let isRestored = false

function restoreStored(): void {
	if (isRestored) return
	isRestored = true
	try {
		const stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? 'null') as StoredTrail | null
		if (!stored || !Array.isArray(stored.entries)) return
		entries.value = stored.entries
		position.value = stored.position
	} catch {
		return
	}
}

function store(): void {
	try {
		window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ entries: entries.value, position: position.value }))
	} catch {
		return
	}
}

function isReload(): boolean {
	const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
	return navigation?.type === 'reload'
}

function markedPosition(): number | undefined {
	const marked: unknown = window.history.state?.[STATE_KEY]
	return typeof marked === 'number' ? marked : undefined
}

/**
 * The library's own trail through the browser's history, one entry per folder
 * or view opened, so its arrows go back and forth like the browser's and stop
 * at the library's first page. Each history entry keeps its place in the
 * trail, which outlives the explorer: the dashboard mounts the page again when
 * the browser goes back to it.
 */
export function useExplorerHistory(currentKey: () => string) {
	const isMounted = ref(false)

	function restart(key: string): void {
		entries.value = [key]
		position.value = 0
	}

	/** Moves to the entry the browser shows, as its history entry or else the nearest one tells. */
	function follow(key: string): void {
		const marked = markedPosition()
		if (marked !== undefined && entries.value[marked] === key) {
			position.value = marked
			return
		}
		if (key === entries.value[position.value]) return
		const matches = entries.value.flatMap((entry, index) => (entry === key ? [index] : []))
		if (matches.length === 0) return restart(key)
		position.value = matches.reduce((nearest, index) =>
			Math.abs(index - position.value) < Math.abs(nearest - position.value) ? index : nearest,
		)
	}

	function record(key: string, isStep: boolean): void {
		if (!isStep) {
			entries.value = entries.value.map((entry, index) => (index === position.value ? key : entry))
			return
		}
		entries.value = [...entries.value.slice(0, position.value + 1), key]
		position.value += 1
	}

	/** Writes the trail's place into the history entry the browser now shows. */
	function mark(): void {
		window.history.replaceState({ ...window.history.state, [STATE_KEY]: position.value }, '')
	}

	function isShown(key: string): boolean {
		return key === entries.value[position.value]
	}

	/** The page shown after a reload is the trail's current entry, as long as it is the same location. */
	function resume(key: string): void {
		const isFirstMount = !isRestored
		restoreStored()
		const marked = markedPosition()
		if (marked !== undefined && entries.value[marked] === key) position.value = marked
		else if (!(isFirstMount && isReload() && entries.value[position.value] === key)) restart(key)
	}

	onMounted(() => {
		resume(currentKey())
		mark()
		isMounted.value = true
	})
	watch([entries, position], store)

	const history = computed<ExplorerHistory>(() => ({
		canGoBack: isMounted.value && position.value > 0,
		canGoForward: isMounted.value && position.value < entries.value.length - 1,
		back: () => window.history.back(),
		forward: () => window.history.forward(),
	}))

	return { history, follow, record, mark, isShown }
}
