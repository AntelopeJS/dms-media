import type { ComponentShortcuts } from '#dms-ui/app/types/shortcuts'
import { EXPLORER_SHORTCUT_GROUPS } from '../utils/explorerShortcuts'

const KEY_LABELS: Record<string, string> = {
	meta: '$keyboard.meta',
	shift: '$keyboard.shift',
	enter: '$keyboard.enter',
	space: '$keyboard.space',
	escape: '$keyboard.escape',
	delete: '$keyboard.delete',
	arrowleft: '←',
	arrowright: '→',
}

export default [
	{
		component: '$dms_media.shortcuts.component',
		shortcuts: EXPLORER_SHORTCUT_GROUPS.flatMap((group) => group.shortcuts).map(
			(shortcut) => ({
				key: shortcut.keys.map((key) => KEY_LABELS[key] ?? key.toLowerCase()),
				descriptionKey: `$dms_media.shortcuts.${shortcut.id}`,
				component: '$dms_media.shortcuts.component',
			}),
		),
	},
] satisfies ComponentShortcuts[]
