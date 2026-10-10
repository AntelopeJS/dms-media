<script setup lang="ts">
import type { MediaFolder } from '../../types/media'
import MediaDialog from '../shared/MediaDialog.vue'

defineProps<{ folder: MediaFolder }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
</script>

<template>
	<MediaDialog
		:title="t('dms_media.dialogs.locked.title', { name: folder.name })"
		:description="t('dms_media.dialogs.locked.description')"
		icon="i-ph-link-simple"
		size="sm"
		@dismiss="emit('close')"
	>
		<div class="flex flex-col gap-3 text-sm">
			<div v-if="folder.binding" class="flex items-center justify-between gap-3">
				<span class="text-muted">{{ t('dms_media.dialogs.locked.managed_by') }}</span>
				<code class="font-mono text-xs">{{ folder.binding }}</code>
			</div>
			<p class="text-default">{{ t('dms_media.dialogs.locked.allowed') }}</p>
		</div>
		<template #footer>
			<UButton
				color="neutral"
				variant="outline"
				:to="MEDIA_ROUTES.linked"
				icon="i-ph-arrow-square-out"
				:label="t('dms_media.dialogs.locked.see_linked')"
				@click="emit('close')"
			/>
			<UButton :label="t('dms_media.actions.got_it')" @click="emit('close')" />
		</template>
	</MediaDialog>
</template>
