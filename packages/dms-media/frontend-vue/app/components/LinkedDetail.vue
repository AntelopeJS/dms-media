<script setup lang="ts">
import type { LinkedFolderDetail } from '../types/media'

interface LinkedRow {
	_id: string
	folderId: string
}

const props = defineProps<{ row: LinkedRow }>()
const api = useMediaApi()
const format = useMediaFormat()
const { t } = useI18n()
const detail = ref<LinkedFolderDetail | null>(null)
const failed = ref(false)

onMounted(async () => {
	try {
		detail.value = await api.linkedDetail(props.row._id)
	} catch {
		failed.value = true
	}
})
</script>

<template>
	<div class="grid gap-4 p-4 lg:grid-cols-2">
		<p v-if="failed" class="text-error text-sm">{{ t('dms_media.linked.detail_failed') }}</p>
		<template v-else-if="detail">
			<div class="flex flex-col gap-3">
				<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
					<dt class="text-muted">{{ t('dms_media.linked.detail.binding') }}</dt>
					<dd class="text-highlighted font-mono">{{ detail.id }}</dd>
					<dt class="text-muted">{{ t('dms_media.rights.read') }}</dt>
					<dd class="text-highlighted font-mono break-all">{{ detail.read.join(', ') || '—' }}</dd>
					<dt class="text-muted">{{ t('dms_media.rights.write') }}</dt>
					<dd class="text-highlighted font-mono break-all">{{ detail.write.join(', ') || '—' }}</dd>
					<dt class="text-muted">{{ t('dms_media.rights.manage') }}</dt>
					<dd class="text-highlighted font-mono break-all">{{ detail.manage.join(', ') }} <span class="text-dimmed">({{ t('dms_media.linked.detail.always') }})</span></dd>
					<dt class="text-muted">{{ t('dms_media.linked.detail.created') }}</dt>
					<dd class="text-highlighted">{{ format.formatDate(detail.createdAt) }}</dd>
				</dl>
				<DmsBanner tone="info" size="sm" :title="t('dms_media.linked.detail.can_do')" :description="t('dms_media.linked.detail.can_do_description')" />
				<div class="flex gap-2">
					<UButton icon="i-ph-folder-open" color="neutral" variant="outline" size="sm" :label="t('dms_media.linked.detail.open')" :to="folderLink(detail.folderId)" />
					<UButton icon="i-ph-shield-check" color="neutral" variant="outline" size="sm" :label="t('dms_media.actions.access')" :to="accessLink(detail.folderId)" />
				</div>
			</div>
			<div class="flex flex-col gap-2">
				<DmsCodeSnippet :code="detail.definition" language="typescript" :title="t('dms_media.linked.detail.definition')" />
				<p class="text-dimmed text-[12px]">{{ t('dms_media.linked.detail.identity') }}</p>
			</div>
		</template>
		<USkeleton v-else class="h-40 w-full lg:col-span-2" />
	</div>
</template>
