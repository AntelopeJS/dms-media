<script setup lang="ts">
const { library, commands } = useExplorerContext()
const format = useMediaFormat()
const { t } = useI18n()

const selected = computed(() => library.selection.selectedAssets.value)
const canWrite = computed(() => selected.value.every(commands.canWriteAsset))
const canChangeVisibility = computed(() => selected.value.every(commands.canChangeVisibility))
const visibleCount = computed(() => library.listing.assets.value.length)
const ZIP_LIMIT = 200
</script>

<template>
	<div
		class="border-default flex flex-wrap items-center gap-2 border-b bg-(--dms-accent-tint) px-4 py-2.5"
		role="toolbar"
		:aria-label="t('dms_media.bulk.label')"
	>
		<UCheckbox :model-value="true" :aria-label="t('dms_media.actions.clear_selection')" @update:model-value="library.selection.clear()" />
		<span class="text-highlighted text-sm font-semibold">
			{{ t('dms_media.bulk.selected', { count: selected.length }, selected.length) }}
		</span>
		<span class="text-muted font-mono text-xs">{{ format.formatBytes(library.selection.selectedSize.value) }}</span>
		<UButton
			v-if="selected.length < visibleCount"
			variant="link"
			size="sm"
			:label="t('dms_media.bulk.select_all', { count: visibleCount })"
			@click="library.selection.selectAll()"
		/>
		<div class="ms-auto flex flex-wrap items-center gap-1.5">
			<UButton v-if="canWrite" icon="i-ph-arrows-out-cardinal" color="neutral" variant="outline" size="sm" :label="t('dms_media.bulk.move')" @click="commands.moveAssets(selected)" />
			<UButton v-if="canChangeVisibility" icon="i-ph-globe" color="neutral" variant="outline" size="sm" :label="t('dms_media.actions.visibility')" @click="commands.changeVisibility(selected)" />
			<UTooltip :text="t('dms_media.bulk.zip_limit', { count: ZIP_LIMIT })" :disabled="selected.length <= ZIP_LIMIT">
				<UButton
					icon="i-ph-download-simple"
					color="neutral"
					variant="outline"
					size="sm"
					:disabled="selected.length > ZIP_LIMIT"
					:label="t('dms_media.bulk.zip')"
					@click="library.actions.downloadZip(selected)"
				/>
			</UTooltip>
			<UButton v-if="canWrite" icon="i-ph-trash" color="error" variant="outline" size="sm" :label="t('dms_media.actions.delete')" @click="commands.deleteAssets(selected)" />
			<UTooltip :text="t('dms_media.actions.clear_selection')" :kbds="['escape']">
				<UButton icon="i-ph-x" color="neutral" variant="ghost" size="sm" square :aria-label="t('dms_media.actions.clear_selection')" @click="library.selection.clear()" />
			</UTooltip>
		</div>
	</div>
</template>
