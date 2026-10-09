<script setup lang="ts">
const { t } = useI18n()
const editor = useAccessEditor()
const summary = computed(() => editor.summary.value)
const folder = computed(() => editor.folder.value)
const fileCount = computed(() => (folder.value ? (editor.foldersById.value.get(folder.value.id)?.fileCount ?? 0) : 0))

function isRuleSource(id: string | null): boolean {
	return id === summary.value?.sourceId || (id === null && summary.value?.sourceId === null)
}
</script>

<template>
	<DmsEmptyState v-if="!editor.selectedId.value" icon="i-ph-folder-simple" :title="t('dms_media.access.pick_folder')" :description="t('dms_media.access.pick_folder_description')" />
	<DmsCard v-else-if="summary && folder">
		<template #header>
			<div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
				<UIcon name="i-ph-folder-simple" class="text-muted size-4" />
				<span class="text-highlighted text-sm font-semibold">{{ folder.name }}</span>
				<span class="text-dimmed font-mono text-[11px]">{{ t('dms_media.explorer.file_count', { count: fileCount }, fileCount) }}</span>
				<UBadge v-if="summary.isOwn" :label="t('dms_media.markers.own_rules')" icon="i-ph-lock-simple" color="warning" variant="subtle" size="sm" />
				<UBadge v-else :label="t('dms_media.access.inherited_from', { name: editor.source.value })" icon="i-ph-arrow-elbow-left-up" color="neutral" variant="subtle" size="sm" />
				<UBadge v-if="folder.bound" :label="t('dms_media.markers.linked_to', { binding: folder.binding })" icon="i-ph-link-simple" color="primary" variant="subtle" size="sm" />
			</div>
		</template>
		<template #actions>
			<template v-if="summary.canEdit">
				<UButton v-if="summary.isOwn" icon="i-ph-arrow-elbow-left-up" color="neutral" variant="ghost" size="sm" :label="t('dms_media.access.inherit')" @click="editor.inheritFromParent" />
				<UButton v-else-if="!editor.isDirty.value" icon="i-ph-lock-simple" color="neutral" variant="outline" size="sm" :label="t('dms_media.access.own_rules')" @click="editor.giveOwnRules" />
			</template>
		</template>
		<div class="flex flex-col gap-4">
			<nav class="flex flex-wrap items-center gap-1 text-[13px]" :aria-label="t('dms_media.access.chain')">
				<template v-for="(link, index) in summary.chain" :key="link.id ?? 'root'">
					<UIcon v-if="index > 0" name="i-ph-caret-right" class="text-dimmed size-3" />
					<span
						class="inline-flex items-center rounded-sm px-1.5 py-0.5"
						:class="isRuleSource(link.id) ? 'border border-(--ui-warning) text-warning' : link.id === folder.id ? 'text-highlighted font-medium' : 'text-muted'"
					>
						<UIcon v-if="link.id === null" name="i-ph-house" class="me-1 size-3.5 align-[-2px]" />{{ editor.chainName(link.name) }}
						<template v-if="isRuleSource(link.id)"> · {{ t('dms_media.access.rules_here') }}</template>
					</span>
				</template>
			</nav>
			<DmsBanner v-if="!summary.canEdit" tone="info" size="sm" :title="folder.bound ? t('dms_media.access.linked_read_only') : t('dms_media.access.read_only')" :description="folder.bound ? t('dms_media.access.linked_read_only_description') : t('dms_media.access.read_only_description')" />
		</div>
	</DmsCard>
	<USkeleton v-else-if="editor.isLoading.value" class="h-40 w-full rounded-lg" />
</template>
