<script setup lang="ts">
const { library, commands } = useExplorerContext()
const { prefs, update } = useMediaPrefs()
const uploads = useUploadQueue()
const format = useMediaFormat()
const { t } = useI18n()
const MIN_TILE = 120
const MAX_TILE = 260

const itemCount = computed(
	() => library.visibleFolders.value.length + library.listing.assets.value.length,
)
const visibleSize = computed(() =>
	library.listing.assets.value.reduce((total, asset) => total + asset.size, 0),
)
const selectedCount = computed(() => library.selection.selectedIds.value.size)
const failedUploads = computed(() => uploads.items.value.filter((item) => item.status === 'failed').length)
const doneUploads = computed(() => uploads.items.value.filter((item) => item.status === 'done').length)
const tileSize = computed({
	get: () => prefs.value.tileSize,
	set: (value: number) => update({ tileSize: value }),
})
</script>

<template>
	<footer class="border-default text-muted flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-1.5 text-[12px]">
		<span>
			{{ t('dms_media.status.items', { count: itemCount }, itemCount) }}
			<span class="font-mono">· {{ format.formatBytes(visibleSize) }}</span>
		</span>
		<span v-if="selectedCount" class="text-primary font-medium">
			{{ t('dms_media.status.selected', { count: selectedCount }, selectedCount) }}
		</span>
		<ULink
			v-if="uploads.activeCount.value || failedUploads"
			:to="MEDIA_ROUTES.uploads"
			class="hover:text-highlighted flex items-center gap-1.5"
		>
			<UIcon v-if="uploads.activeCount.value" name="i-ph-circle-notch" class="text-primary size-3.5 animate-spin" />
			<UIcon v-else name="i-ph-warning-circle" class="text-error size-3.5" />
			<span v-if="uploads.activeCount.value">
				{{ t('dms_media.status.uploading', { done: doneUploads, total: doneUploads + uploads.activeCount.value }) }}
			</span>
			<span v-else class="text-error">{{ t('dms_media.status.failed', { count: failedUploads }, failedUploads) }}</span>
		</ULink>
		<div class="ms-auto flex items-center gap-3 max-sm:hidden">
			<span class="flex items-center gap-1"><UKbd value="space" size="sm" />{{ t('dms_media.actions.preview') }}</span>
			<button type="button" class="hover:text-highlighted flex items-center gap-1" @click="commands.showShortcuts()">
				<UKbd value="?" size="sm" />{{ t('dms_media.shortcuts.title') }}
			</button>
			<div v-if="prefs.view === 'grid'" class="flex w-32 items-center gap-2">
				<UIcon name="i-ph-image" class="size-3" />
				<USlider v-model="tileSize" :min="MIN_TILE" :max="MAX_TILE" :step="4" size="xs" :aria-label="t('dms_media.status.tile_size')" />
				<UIcon name="i-ph-image" class="size-4" />
			</div>
		</div>
	</footer>
</template>
