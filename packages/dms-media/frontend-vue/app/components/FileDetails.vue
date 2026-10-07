<script setup lang="ts">
import type { AssetVisibility, DeleteFilesChoice } from '../types/media'
import DeleteFilesDialog from './dialogs/DeleteFilesDialog.vue'
import MoveDialog from './dialogs/MoveDialog.vue'
import FileViewer from './file/FileViewer.vue'
import FileVisibility from './file/FileVisibility.vue'
import AltTextField from './shared/AltTextField.vue'
import MediaLightbox from './shared/MediaLightbox.vue'

const route = useDmsRoute()
const router = useDmsRouter()
const { t } = useI18n()
const toast = useToast()
const format = useMediaFormat()
const overlay = useOverlay()
const moveDialog = overlay.create(MoveDialog)
const deleteDialog = overlay.create(DeleteFilesDialog)
const lightbox = overlay.create(MediaLightbox)
const config = useDmsRuntimeConfig()

const assetId = computed(() => (typeof route.query.asset === 'string' ? route.query.asset : undefined))
const file = useFileDetails(assetId)
const asset = computed(() => file.asset.value)
const details = computed(() => file.details.value)
const tab = ref('details')
const nameDraft = ref('')
const apiOrigin = computed(() => config.public.dms.baseURL ?? '')
const extension = computed(() => (asset.value ? extensionOf(asset.value) : ''))
const hasExtension = computed(() => Boolean(asset.value?.name.toLowerCase().endsWith(`.${extension.value}`)))

watch(
	asset,
	(current) => {
		if (current) nameDraft.value = baseNameOf(current)
	},
	{ immediate: true },
)

const tabs = computed(() => [
	{ label: t('dms_media.file.tabs.details'), value: 'details' },
	{ label: t('dms_media.file.tabs.delivery'), value: 'delivery', badge: details.value?.presets.length ? String(details.value.presets.length + 1) : undefined },
	{ label: t('dms_media.file.tabs.history'), value: 'history' },
	{ label: t('dms_media.file.tabs.usage'), value: 'usage' },
])

function open(id: string | undefined): void {
	if (id) void router.replace({ path: route.path, query: { asset: id } })
}

function back(): void {
	void navigateDms(asset.value ? folderLink(asset.value.folderId) : MEDIA_ROUTES.files)
}

async function saveName(): Promise<void> {
	if (!asset.value) return
	const name = nameDraft.value.trim()
	if (!name) {
		nameDraft.value = baseNameOf(asset.value)
		return
	}
	await file.rename(hasExtension.value ? `${name}.${extension.value}` : name)
}

async function copy(url: string): Promise<void> {
	await navigator.clipboard.writeText(url)
	toast.add({ title: t('dms_media.toasts.link_copied'), color: 'success', icon: 'i-ph-link' })
}

async function download(): Promise<void> {
	if (!asset.value) return
	const { url } = await useMediaApi().readUrl(asset.value.id)
	downloadFile(url, asset.value.name)
}

async function move(): Promise<void> {
	if (!asset.value || !file.tree.value) return
	const target = await moveDialog.open({
		title: t('dms_media.dialogs.move.files_title', { count: 1 }, 1),
		folders: file.tree.value.folders,
		currentFolderId: asset.value.folderId,
		right: 'write',
	})
	if (target) await file.move(target)
}

async function remove(): Promise<void> {
	if (!asset.value) return
	const choice: DeleteFilesChoice = await deleteDialog.open({ assets: [asset.value], canMakePrivate: file.canChangeVisibility.value })
	if (choice === 'private') return file.setVisibility('private')
	if (choice !== 'delete') return
	const folderId = asset.value.folderId
	if (await file.remove()) await navigateDms(folderLink(folderId))
}

function changeVisibility(visibility: AssetVisibility): void {
	void file.setVisibility(visibility)
}

function fullscreen(): void {
	if (!asset.value) return
	void lightbox.open({ assets: file.siblings.value.length ? file.siblings.value : [asset.value], startId: asset.value.id, canEdit: () => file.canWrite.value })
}

function edit(): void {
	if (asset.value && file.canWrite.value && isEditableAsset(asset.value)) void navigateDms(editorLink(asset.value.id))
}

defineShortcuts({
	arrowleft: () => open(file.previous.value?.id),
	arrowright: () => open(file.next.value?.id),
	e: edit,
	' ': fullscreen,
})
</script>

<template>
	<div class="flex flex-col gap-4">
		<header class="flex flex-wrap items-start gap-3">
			<UButton icon="i-ph-arrow-left" color="neutral" variant="outline" square :aria-label="t('dms_media.actions.back')" @click="back" />
			<div class="min-w-0 flex-1">
				<USkeleton v-if="!asset" class="h-7 w-72" />
				<div v-else class="flex flex-wrap items-center gap-2">
					<h1 class="text-highlighted truncate text-2xl font-semibold tracking-tight">{{ asset.name }}</h1>
					<UBadge
						:label="t(`dms_media.visibility.${asset.effectiveVisibility}`)"
						:icon="asset.effectiveVisibility === 'public' ? 'i-ph-globe' : 'i-ph-lock-simple'"
						:color="asset.effectiveVisibility === 'public' ? 'success' : 'neutral'"
						variant="subtle"
					/>
					<UBadge v-if="asset.hasOriginal" :label="t('dms_media.file.edited')" icon="i-ph-crop" color="neutral" variant="subtle" />
				</div>
				<p v-if="details" class="text-muted mt-1 text-sm">
					{{ pathLabel(details.path) }}
					<template v-if="file.index.value >= 0"> · {{ t('dms_media.lightbox.position', { index: file.index.value + 1, total: file.siblings.value.length }) }}</template>
				</p>
			</div>
			<div v-if="asset" class="flex flex-wrap items-center gap-2">
				<div class="flex">
					<UButton icon="i-ph-caret-left" color="neutral" variant="outline" square class="rounded-e-none" :disabled="!file.previous.value" :aria-label="t('dms_media.lightbox.previous')" @click="open(file.previous.value?.id)" />
					<UButton icon="i-ph-caret-right" color="neutral" variant="outline" square class="-ms-px rounded-s-none" :disabled="!file.next.value" :aria-label="t('dms_media.lightbox.next')" @click="open(file.next.value?.id)" />
				</div>
				<UButton icon="i-ph-link" color="neutral" variant="outline" :label="t('dms_media.actions.copy_link')" @click="copy(`${apiOrigin}${asset.url}`)" />
				<UButton icon="i-ph-download-simple" color="neutral" variant="outline" :label="t('dms_media.actions.download')" @click="download" />
				<UButton v-if="file.canWrite.value && isEditableAsset(asset)" icon="i-ph-crop" :label="t('dms_media.actions.edit_image')" @click="edit">
					<template #trailing><UKbd value="E" size="sm" variant="subtle" /></template>
				</UButton>
			</div>
		</header>
		<DmsEmptyState
			v-if="file.error.value && !asset"
			variant="error"
			:title="t('dms_media.file.not_found')"
			:description="t('dms_media.file.not_found_description')"
			:actions="[{ label: t('dms_media.overview.open_library'), to: MEDIA_ROUTES.files }]"
		/>
		<div v-else-if="asset && details" class="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
			<FileViewer :asset="asset" :siblings="file.siblings.value" @open="open" @fullscreen="fullscreen" />
			<aside class="dms-card flex flex-col overflow-hidden">
				<UTabs v-model="tab" :items="tabs" variant="link" class="border-default border-b px-3 pt-1" :content="false" />
				<div class="min-h-0 flex-1 overflow-y-auto p-4">
					<div v-if="tab === 'details'" class="flex flex-col gap-5">
						<UFormField :label="t('dms_media.columns.name')" :help="t('dms_media.dialogs.rename.file_description')">
							<UInput v-model="nameDraft" class="w-full" :disabled="!file.canWrite.value" @blur="saveName" @keydown.enter.prevent="saveName">
								<template v-if="hasExtension" #trailing>
									<span class="text-muted font-mono text-xs">.{{ extension }}</span>
								</template>
							</UInput>
						</UFormField>
						<AltTextField v-if="isImageAsset(asset)" :asset="asset" :can-edit="file.canWrite.value" :save="file.setAlt" />
						<UFormField :label="t('dms_media.file.folder')">
							<div class="flex gap-2">
								<div class="border-default flex min-w-0 flex-1 items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
									<UIcon name="i-ph-folder-simple" class="text-muted size-4" />
									<span class="text-highlighted truncate">{{ details.folder.name }}</span>
									<span class="text-dimmed truncate font-mono text-[11px]">{{ pathLabel(details.path.slice(0, -1)) }}</span>
								</div>
								<UButton v-if="file.canWrite.value" color="neutral" variant="outline" :label="t('dms_media.file.move')" @click="move" />
							</div>
						</UFormField>
						<UFormField :label="t('dms_media.columns.visibility')">
							<FileVisibility :asset="asset" :folder="details.folder" :can-change="file.canChangeVisibility.value" @change="changeVisibility" />
						</UFormField>
						<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
							<DmsEyebrow :label="t('dms_media.file.information')" tone="muted" class="col-span-2 mb-1" />
							<dt class="text-muted">{{ t('dms_media.file.uploaded') }}</dt>
							<dd class="text-highlighted text-end">{{ format.formatDate(asset.createdAt) }}<template v-if="details.uploadedBy"> · {{ details.uploadedBy }}</template></dd>
							<dt class="text-muted">{{ t('dms_media.columns.modified') }}</dt>
							<dd class="text-highlighted text-end">{{ format.formatRelativeTime(asset.updatedAt) }}<template v-if="asset.hasOriginal"> · {{ t('dms_media.file.edited').toLowerCase() }}</template></dd>
							<dt class="text-muted">{{ t('dms_media.columns.type') }}</dt>
							<dd class="text-highlighted text-end font-mono">{{ asset.mimetype }}</dd>
							<dt class="text-muted">{{ t('dms_media.file.asset_id') }}</dt>
							<dd class="text-highlighted truncate text-end font-mono text-[12px]">{{ asset.id }}</dd>
						</dl>
					</div>
					<div v-else-if="tab === 'delivery'" class="flex flex-col gap-4">
						<p class="text-muted text-[13px]">{{ asset.effectiveVisibility === 'public' ? t('dms_media.file.delivery_public') : t('dms_media.file.delivery_private') }}</p>
						<div class="flex flex-col gap-1.5">
							<span class="text-highlighted text-sm font-medium">{{ t('dms_media.file.stable_link') }}</span>
							<div class="flex gap-2">
								<code class="border-default min-w-0 flex-1 truncate rounded-md border bg-(--dms-bg-muted) px-2.5 py-1.5 font-mono text-[12px]">{{ asset.url }}</code>
								<UButton icon="i-ph-copy" color="neutral" variant="outline" size="sm" square :aria-label="t('dms_media.actions.copy_link')" @click="copy(`${apiOrigin}${asset.url}`)" />
							</div>
						</div>
						<div v-for="preset in details.presets" :key="preset.id" class="flex flex-col gap-1.5">
							<span class="text-highlighted flex items-center gap-2 text-sm font-medium">
								{{ preset.id }}
								<span class="text-dimmed font-mono text-[11px]">{{ preset.width ?? '–' }} × {{ preset.height ?? '–' }}</span>
							</span>
							<div class="flex gap-2">
								<code class="border-default min-w-0 flex-1 truncate rounded-md border bg-(--dms-bg-muted) px-2.5 py-1.5 font-mono text-[12px]">{{ preset.url }}</code>
								<UButton icon="i-ph-copy" color="neutral" variant="outline" size="sm" square :aria-label="t('dms_media.actions.copy_link')" @click="copy(`${apiOrigin}${preset.url}`)" />
							</div>
						</div>
						<UButton variant="link" size="sm" class="self-start" icon="i-ph-frame-corners" :label="t('dms_media.file.see_presets')" :to="MEDIA_ROUTES.presets" />
					</div>
					<DmsActivityFeed
						v-else-if="tab === 'history'"
						:fetch-url="`/api/media/assets/${asset.id}/history`"
						:card="false"
						:group-by-day="true"
						:empty="{ title: t('dms_media.file.no_history') }"
					/>
					<DmsEmptyState
						v-else
						icon="i-ph-graph"
						:title="t('dms_media.file.usage_title')"
						:description="t('dms_media.file.usage_description')"
					/>
				</div>
				<footer class="border-default flex items-center justify-between gap-2 border-t px-4 py-2.5">
					<UButton v-if="file.canWrite.value" icon="i-ph-trash" color="error" variant="ghost" size="sm" :label="t('dms_media.file.delete')" @click="remove" />
					<span class="text-dimmed ms-auto text-[12px]">{{ t('dms_media.file.autosave') }}</span>
				</footer>
			</aside>
		</div>
		<div v-else class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
			<USkeleton class="h-[520px] w-full rounded-lg" />
			<USkeleton class="h-[520px] w-full rounded-lg" />
		</div>
	</div>
</template>
