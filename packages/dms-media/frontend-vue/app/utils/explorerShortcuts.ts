export type ExplorerShortcutId =
	| 'search'
	| 'upload'
	| 'new_folder'
	| 'preview'
	| 'open'
	| 'edit'
	| 'rename'
	| 'move'
	| 'delete'
	| 'select_all'
	| 'clear'
	| 'view_grid'
	| 'view_list'
	| 'view_columns'
	| 'details'
	| 'help'
	| 'previous'
	| 'next'

export interface ExplorerShortcut {
	id: ExplorerShortcutId
	/** Keys shown to the user, in UKbd values. */
	keys: string[]
}

export interface ExplorerShortcutGroup {
	id: 'navigate' | 'files' | 'view'
	shortcuts: ExplorerShortcut[]
}

export const EXPLORER_SHORTCUT_GROUPS: ExplorerShortcutGroup[] = [
	{
		id: 'navigate',
		shortcuts: [
			{ id: 'search', keys: ['meta', '/'] },
			{ id: 'open', keys: ['enter'] },
			{ id: 'preview', keys: ['space'] },
			{ id: 'previous', keys: ['arrowleft'] },
			{ id: 'next', keys: ['arrowright'] },
			{ id: 'help', keys: ['?'] },
		],
	},
	{
		id: 'files',
		shortcuts: [
			{ id: 'upload', keys: ['U'] },
			{ id: 'new_folder', keys: ['shift', 'N'] },
			{ id: 'edit', keys: ['E'] },
			{ id: 'rename', keys: ['F2'] },
			{ id: 'move', keys: ['M'] },
			{ id: 'delete', keys: ['delete'] },
			{ id: 'select_all', keys: ['meta', 'A'] },
			{ id: 'clear', keys: ['escape'] },
		],
	},
	{
		id: 'view',
		shortcuts: [
			{ id: 'view_grid', keys: ['1'] },
			{ id: 'view_list', keys: ['2'] },
			{ id: 'view_columns', keys: ['3'] },
			{ id: 'details', keys: ['I'] },
		],
	},
]

/** ⌘/ and ⌘⇧/ (AZERTY): "/" alone belongs to the navigation search. */
export const SEARCH_SHORTCUT_KEYS = ['meta_/', 'meta_shift_/'] as const

export function buildSearchShortcuts(focus: () => void): Record<string, () => void> {
	return Object.fromEntries(SEARCH_SHORTCUT_KEYS.map((key) => [key, focus]))
}
