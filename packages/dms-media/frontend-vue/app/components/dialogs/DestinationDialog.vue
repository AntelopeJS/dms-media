<script setup lang="ts">
import type { MediaFolder } from '../../types/media'
import FolderPickerTree from '../shared/FolderPickerTree.vue'
import MediaDialog from '../shared/MediaDialog.vue'

const props = defineProps<{
	folders: MediaFolder[]
	initialId?: string | null
	count?: number
}>()
const emit = defineEmits<{ close: [string | null] }>()
const { t } = useI18n()
const target = ref<string | null | undefined>(
	props.folders.find((folder) => folder.id === props.initialId && folder.rights.write)?.id,
)

function isAllowed(folder: MediaFolder): string | undefined {
	return folder.rights.write ? undefined : t('dms_media.dialogs.no_upload_here')
}
</script>

<template>
	<MediaDialog
		:title="t('dms_media.dialogs.destination.title')"
		:description="t('dms_media.dialogs.destination.description')"
		icon="i-ph-cloud-arrow-up"
		@dismiss="emit('close', null)"
	>
		<FolderPickerTree v-model="target" :folders="folders" :is-allowed="isAllowed" />
		<template #footer>
			<UButton color="neutral" variant="outline" :label="t('dms_media.actions.cancel')" @click="emit('close', null)" />
			<UButton
				icon="i-ph-upload-simple"
				:label="count ? t('dms_media.dialogs.destination.confirm_count', { count }, count) : t('dms_media.dialogs.destination.confirm')"
				:disabled="!target"
				@click="emit('close', target ?? null)"
			/>
		</template>
	</MediaDialog>
</template>
