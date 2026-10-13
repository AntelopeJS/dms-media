type GridStep = (columns: number) => number

const GRID_STEPS: Record<string, GridStep> = {
	ArrowRight: () => 1,
	ArrowLeft: () => -1,
	ArrowDown: (columns) => columns,
	ArrowUp: (columns) => -columns,
}

/** How many items share the first row of a wrapping grid, read from the layout. */
export function gridColumnsOf(items: HTMLElement[]): number {
	const topOf = (item: HTMLElement) => Math.round(item.getBoundingClientRect().top)
	const firstTop = items[0] ? topOf(items[0]) : undefined
	const firstRow = items.findIndex((item) => topOf(item) !== firstTop)
	return firstRow < 0 ? Math.max(items.length, 1) : Math.max(firstRow, 1)
}

/**
 * The index an arrow, Home or End key moves to in a grid of `count` items,
 * or `undefined` when the key is not a move or would leave the grid.
 */
export function gridIndexAfter(key: string, index: number, count: number, columns: number): number | undefined {
	if (count === 0) return undefined
	if (key === 'Home') return 0
	if (key === 'End') return count - 1
	const step = GRID_STEPS[key]
	if (!step) return undefined
	const next = Math.max(index, 0) + (index < 0 ? 0 : step(columns))
	return next >= 0 && next < count ? next : undefined
}

export function isGridKey(key: string): boolean {
	return key in GRID_STEPS || key === 'Home' || key === 'End'
}

/** Moves the focus to an element and keeps it in view. */
export function focusInView(element: HTMLElement | null | undefined): void {
	element?.focus({ preventScroll: true })
	element?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}
