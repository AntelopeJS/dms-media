<script setup lang="ts">
import type { MediaFolder } from '../../types/media'
import FolderPickerTree from '../shared/FolderPickerTree.vue'
import MediaDialog from '../shared/MediaDialog.vue'

const props = defineProps<{
	title: string
	description?: string
	folders: MediaFolder[]
	currentFolderId?: string | null
	excludedIds?: string[]
	right: 'write' | 'manage'
	allowRoot?: boolean
	rootAllowed?: boolean
}>()
const emit = defineEmits<{ close: [string | null | undefined] }>()
const { t } = useI18n()
const target = ref<string | null | undefined>(undefined)
const excluded = computed(() => new Set(props.excludedIds ?? []))

function isAllowed(folder: MediaFolder): string | undefined {
	if (excluded.value.has(folder.id)) return t('dms_media.dialogs.move_inside_itself')
	if (folder.id === props.currentFolderId) return t('dms_media.dialogs.already_here')
	if (!folder.rights[props.right]) return t('dms_media.dialogs.no_right_here')
	return undefined
}

const canConfirm = computed(() =>
	target.value === null ? Boolean(props.rootAllowed) : target.value !== undefined,
)
</script>

<template>
	<MediaDialog
		:title="title"
		:description="description"
		icon="i-ph-arrows-out-cardinal"
		@dismiss="emit('close', undefined)"
	>
		<FolderPickerTree
			v-model="target"
			:folders="folders"
			:is-allowed="isAllowed"
			:allow-root="allowRoot && rootAllowed"
		/>
		<template #footer>
			<UButton color="neutral" variant="outline" :label="t('dms_media.actions.cancel')" @click="emit('close', undefined)" />
			<UButton :label="t('dms_media.actions.move_here')" :disabled="!canConfirm" @click="emit('close', target)" />
		</template>
	</MediaDialog>
</template>
