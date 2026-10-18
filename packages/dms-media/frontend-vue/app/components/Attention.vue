<script setup lang="ts">
import type { AttentionResponse } from '../types/media'

const { t } = useI18n()
const { processText } = useComposedText()
// Read again on each library change, its own trigger: the page's refreshes leave it alone.
const attention = useApiData<AttentionResponse>(MEDIA_READS.attention, { refreshOnPageRefresh: false })
// Read with the page: the rows it lists, or its empty state, are only known
// once it answers, and it sits above the rest of the overview, so a skeleton
// the answer replaces would push every block below it.
await attention

onLibraryChange(() => attention.refresh())

const isFailed = computed(() => !attention.data.value && Boolean(attention.error.value))
const items = computed(() =>
	(attention.data.value?.items ?? []).map((item) => ({
		...item,
		label: processText(item.label),
		detail: item.detail ? processText(item.detail) : undefined,
	})),
)
</script>

<template>
	<DmsCard :title="t('dms_media.overview.attention.title')" :padded="false">
		<DmsEmptyState v-if="isFailed" size="sm" variant="error" :title="t('dms_media.empty.error_title')" :description="t('dms_media.empty.error_description')" />
		<DmsEmptyState
			v-else-if="items.length === 0"
			size="sm"
			variant="no-data"
			:title="t('dms_media.overview.attention.empty')"
			:description="t('dms_media.overview.attention.empty_description')"
		/>
		<!-- Inset to the card head's padding, as the DMS KeyValueList block lays out its rows. -->
		<DmsKeyValueList v-else class="px-[18px] py-2" :items="items" />
	</DmsCard>
</template>
