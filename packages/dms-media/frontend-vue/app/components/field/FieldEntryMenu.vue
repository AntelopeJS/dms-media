<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const props = defineProps<{
	index: number
	count: number
	name: string
	/** The first entry is the cover: "move to first" says so. */
	hasCover?: boolean
	canPreview?: boolean
	/** A button on a dark thumbnail rather than in a row. */
	overlay?: boolean
}>()
const emit = defineEmits<{ move: [number]; remove: []; preview: [] }>()
const { t } = useI18n()

const isFirst = computed(() => props.index === 0)
const isLast = computed(() => props.index === props.count - 1)

/** Only the moves that change something: the cover is not offered to become the cover. */
const moves = computed<(DropdownMenuItem | null)[]>(() => [
	props.canPreview
		? {
				label: t('dms_media.field_widget.menu.preview'),
				icon: 'i-ph-eye',
				onSelect: () => emit('preview'),
			}
		: null,
	!isFirst.value
		? {
				label: props.hasCover
					? t('dms_media.field_widget.menu.make_cover')
					: t('dms_media.field_widget.menu.move_first'),
				icon: props.hasCover ? 'i-ph-star' : 'i-ph-arrow-line-up',
				onSelect: () => emit('move', 0),
			}
		: null,
	!isFirst.value
		? {
				label: t('dms_media.field_widget.menu.move_before'),
				icon: 'i-ph-arrow-left',
				onSelect: () => emit('move', props.index - 1),
			}
		: null,
	!isLast.value
		? {
				label: t('dms_media.field_widget.menu.move_after'),
				icon: 'i-ph-arrow-right',
				onSelect: () => emit('move', props.index + 1),
			}
		: null,
])

const items = computed<DropdownMenuItem[][]>(() => [
	moves.value.filter((entry): entry is DropdownMenuItem => entry !== null),
	[
		{
			label: t('dms_media.field_widget.menu.remove'),
			icon: 'i-ph-x',
			color: 'error',
			onSelect: () => emit('remove'),
		},
	],
])
</script>

<template>
	<UDropdownMenu :items="items" :content="{ align: 'end' }">
		<UButton
			icon="i-ph-dots-three-bold"
			color="neutral"
			:variant="overlay ? 'solid' : 'ghost'"
			size="xs"
			square
			:aria-label="t('dms_media.field_widget.menu.label', { name })"
			@click.stop
		/>
	</UDropdownMenu>
</template>
