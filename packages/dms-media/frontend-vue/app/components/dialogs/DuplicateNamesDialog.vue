<script setup lang="ts">
import MediaDialog from '../shared/MediaDialog.vue'

const props = defineProps<{
	folderName: string
	names: string[]
}>()
const emit = defineEmits<{ close: [boolean] }>()
const { t } = useI18n()
const VISIBLE_NAMES = 6
const shown = computed(() => props.names.slice(0, VISIBLE_NAMES))
const hidden = computed(() => props.names.length - shown.value.length)
</script>

<template>
	<MediaDialog
		:title="t('dms_media.dialogs.duplicates.title', { count: names.length }, names.length)"
		:description="t('dms_media.dialogs.duplicates.description', { name: folderName })"
		icon="i-ph-copy"
		tone="warning"
		size="sm"
		@dismiss="emit('close', false)"
	>
		<ul class="border-default divide-default divide-y rounded-md border text-sm">
			<li v-for="name in shown" :key="name" class="flex items-center gap-2 px-3 py-2">
				<UIcon name="i-ph-file" class="text-dimmed size-4 shrink-0" />
				<span class="text-highlighted truncate">{{ name }}</span>
			</li>
			<li v-if="hidden" class="text-muted px-3 py-2">
				{{ t('dms_media.dialogs.duplicates.more', { count: hidden }, hidden) }}
			</li>
		</ul>
		<template #footer>
			<UButton color="neutral" variant="outline" :label="t('dms_media.actions.cancel')" @click="emit('close', false)" />
			<UButton icon="i-ph-copy" :label="t('dms_media.dialogs.duplicates.keep_both')" @click="emit('close', true)" />
		</template>
	</MediaDialog>
</template>
