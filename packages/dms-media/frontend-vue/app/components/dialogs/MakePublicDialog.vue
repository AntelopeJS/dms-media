<script setup lang="ts">
import MediaDialog from '../shared/MediaDialog.vue'

defineProps<{ name: string }>()
const emit = defineEmits<{ close: [boolean] }>()
const { t } = useI18n()
</script>

<template>
	<MediaDialog
		:title="t('dms_media.asset_link.make_public_title', { name })"
		:description="t('dms_media.asset_link.make_public_description')"
		icon="i-ph-globe"
		tone="warning"
		size="sm"
		@dismiss="emit('close', false)"
	>
		<template #footer>
			<UButton color="neutral" variant="outline" :label="t('dms_media.actions.cancel')" @click="emit('close', false)" />
			<UButton data-initial-focus color="warning" icon="i-ph-globe" :label="t('dms_media.asset_link.make_public_confirm')" @click="emit('close', true)" />
		</template>
	</MediaDialog>
</template>
