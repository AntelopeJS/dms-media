<script setup lang="ts">
const { t } = useI18n()
const editor = useAccessEditor()
const summary = computed(() => editor.summary.value)
const folder = computed(() => editor.folder.value)
const canChange = computed(() => Boolean(summary.value?.canEdit || (folder.value?.rights.manage && editor.tree.value?.canManagePermissions)))
</script>

<template>
	<DmsCard v-if="summary && folder" :title="t('dms_media.access.visibility_title')">
		<div class="flex flex-col gap-3">
			<div class="grid gap-3 sm:grid-cols-2">
				<button
					v-for="option in (['private', 'public'] as const)"
					:key="option"
					type="button"
					role="radio"
					:aria-checked="folder.visibility === option"
					:disabled="!canChange"
					class="border-default flex items-start gap-3 rounded-md border p-3 text-start disabled:cursor-not-allowed disabled:opacity-60"
					:class="folder.visibility === option ? 'border-(--ui-primary) bg-(--dms-accent-tint)' : 'hover:bg-(--dms-bg-muted)'"
					@click="editor.setVisibility(option)"
				>
					<UIcon :name="option === 'public' ? 'i-ph-globe' : 'i-ph-lock-simple'" class="text-muted mt-0.5 size-4" />
					<span class="flex-1">
						<span class="text-highlighted block text-sm font-medium">{{ t(`dms_media.visibility.${option}`) }}</span>
						<span class="text-muted block text-[12px]">{{ t(`dms_media.access.visibility_${option}`) }}</span>
					</span>
				</button>
			</div>
			<DmsBanner
				tone="info"
				size="sm"
				:title="t('dms_media.access.applies_to', { count: summary.directFiles, name: folder.name }, summary.directFiles)"
				:description="summary.overrides.length ? t('dms_media.access.overrides', { count: summary.overrides.length, names: summary.overrides.slice(0, 3).map((entry) => entry.name).join(', ') }, summary.overrides.length) : t('dms_media.access.no_overrides')"
			/>
		</div>
	</DmsCard>
</template>
