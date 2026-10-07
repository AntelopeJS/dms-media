<script setup lang="ts">
import type { AssetVisibility } from '../../types/media'
import MediaDialog from '../shared/MediaDialog.vue'

const props = defineProps<{ count: number; current?: AssetVisibility }>()
const emit = defineEmits<{ close: [AssetVisibility | null] }>()
const { t } = useI18n()
const choice = ref<AssetVisibility>(props.current ?? 'inherit')

const options = computed(() =>
	(['inherit', 'private', 'public'] as const).map((value) => ({
		value,
		label: t(`dms_media.visibility_choice.${value}.label`),
		description: t(`dms_media.visibility_choice.${value}.description`),
	})),
)
</script>

<template>
	<MediaDialog
		:title="t('dms_media.dialogs.visibility.title', { count }, count)"
		:description="t('dms_media.dialogs.visibility.description')"
		icon="i-ph-globe"
		size="sm"
		@dismiss="emit('close', null)"
	>
		<URadioGroup v-model="choice" :items="options" variant="card" />
		<template #footer>
			<UButton color="neutral" variant="outline" :label="t('dms_media.actions.cancel')" @click="emit('close', null)" />
			<UButton :label="t('dms_media.dialogs.visibility.confirm', { count }, count)" @click="emit('close', choice)" />
		</template>
	</MediaDialog>
</template>
