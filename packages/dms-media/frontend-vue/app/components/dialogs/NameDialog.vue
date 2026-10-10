<script setup lang="ts">
import MediaDialog from '../shared/MediaDialog.vue'

const props = defineProps<{
	title: string
	description?: string
	icon?: string
	label: string
	initial?: string
	suffix?: string
	confirmLabel: string
}>()
const emit = defineEmits<{ close: [string | null] }>()
const { t } = useI18n()
const name = ref(props.initial ?? '')
const MAX_NAME_LENGTH = 255
const FORBIDDEN = /[\\/]/

const error = computed(() => {
	const value = name.value.trim()
	if (!value) return t('dms_media.dialogs.name_required')
	if (FORBIDDEN.test(value)) return t('dms_media.dialogs.name_forbidden')
	if ((value + (props.suffix ?? '')).length > MAX_NAME_LENGTH)
		return t('dms_media.dialogs.name_too_long')
	return undefined
})

function submit(): void {
	if (error.value) return
	emit('close', name.value.trim() + (props.suffix ?? ''))
}
</script>

<template>
	<MediaDialog
		:title="title"
		:description="description"
		:icon="icon"
		size="sm"
		@dismiss="emit('close', null)"
	>
		<form id="dms-media-name-form" @submit.prevent="submit">
			<UFormField :label="label" :error="name ? error : undefined">
				<UInput v-model="name" autofocus class="w-full" :ui="{ trailing: 'pe-1' }">
					<template v-if="suffix" #trailing>
						<span class="text-muted font-mono text-xs">{{ suffix }}</span>
					</template>
				</UInput>
			</UFormField>
		</form>
		<template #footer>
			<UButton color="neutral" variant="outline" :label="t('dms_media.actions.cancel')" @click="emit('close', null)" />
			<UButton type="submit" form="dms-media-name-form" :label="confirmLabel" :disabled="Boolean(error)" />
		</template>
	</MediaDialog>
</template>
