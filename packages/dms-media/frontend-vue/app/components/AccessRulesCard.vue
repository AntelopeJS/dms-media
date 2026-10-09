<script setup lang="ts">
import AccessRules from './access/AccessRules.vue'

const { t } = useI18n()
const editor = useAccessEditor()
const summary = computed(() => editor.summary.value)
</script>

<template>
	<DmsCard v-if="summary && editor.folder.value" :title="t('dms_media.access.rules')" :padded="false">
		<AccessRules
			:entries="editor.shownEntries.value"
			:can-edit="summary.canEdit && (summary.isOwn || editor.isDirty.value)"
			:subjects="editor.subjects.value"
			@change="editor.draft.value = $event"
		/>
		<template v-if="editor.isDirty.value" #footer>
			<span class="text-muted text-[12px]">{{ t('dms_media.access.unsaved') }}</span>
			<div class="ms-auto flex gap-2">
				<UButton color="neutral" variant="outline" size="sm" :label="t('dms_media.actions.cancel')" @click="editor.draft.value = null" />
				<UButton size="sm" icon="i-ph-check" :loading="editor.isSaving.value" :label="t('dms_media.access.save')" @click="editor.saveRules(editor.draft.value)" />
			</div>
		</template>
	</DmsCard>
</template>
