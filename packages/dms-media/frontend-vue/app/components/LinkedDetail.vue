<script setup lang="ts">
import type { LinkedFolderDetail } from '../types/media'
import CodeBlock from './shared/CodeBlock.vue'

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

const snippet = computed(() => {
	const current = detail.value
	if (!current) return ''
	const lines = ['new AssetType({']
	if (current.field.multiple) lines.push('  multiple: true,')
	if (current.field.max !== undefined) lines.push(`  max: ${current.field.max},`)
	if (current.field.mimetypes?.length) lines.push(`  mimetypes: [${current.field.mimetypes.map((type) => `"${type}"`).join(', ')}],`)
	lines.push('  binding: {', `    id: "${current.id}",`, `    folderName: "${current.folderName}",`)
	if (current.fromPage) lines.push('    permissionsFromPage: YourPage,')
	else lines.push('    permissionMapping: {', `      read: [${current.read.map((id) => `"${id}"`).join(', ')}],`, `      write: [${current.write.map((id) => `"${id}"`).join(', ')}],`, '    },')
	lines.push('  },', '});')
	return lines.join('\n')
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
				<CodeBlock :code="snippet" :label="t('dms_media.linked.detail.definition')" />
				<p class="text-dimmed text-[12px]">{{ t('dms_media.linked.detail.identity') }}</p>
			</div>
		</template>
		<USkeleton v-else class="h-40 w-full lg:col-span-2" />
	</div>
</template>
