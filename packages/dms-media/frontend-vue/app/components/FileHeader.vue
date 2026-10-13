<script setup lang="ts">
const { t } = useI18n()
const file = useCurrentFile()
const assetLink = useAssetLink()
const asset = computed(() => file.asset.value)
const details = computed(() => file.details.value)
const isDownloading = ref(false)
const isUnavailable = computed(() => Boolean(file.error.value) && !asset.value)
const unavailableActions = computed(() => [
	...(file.lastFolderId.value ? [{ label: t('dms_media.file.open_folder'), to: folderLink(file.lastFolderId.value) }] : []),
	{ label: t('dms_media.overview.open_library'), to: MEDIA_ROUTES.files, variant: 'outline' as const, color: 'neutral' as const },
])

function back(): void {
	const folderId = asset.value?.folderId ?? file.lastFolderId.value
	void navigateDms(folderId ? folderLink(folderId) : MEDIA_ROUTES.files)
}

function copyLink(): void {
	if (!asset.value) return
	const makePublic = () => file.setVisibility('public')
	void assetLink.copyLink(asset.value, file.canChangeVisibility.value ? { makePublic } : {})
}

async function download(): Promise<void> {
	if (!asset.value || isDownloading.value) return
	isDownloading.value = true
	await assetLink.download(asset.value)
	isDownloading.value = false
}

definePageShortcuts(() => ({
	arrowleft: () => file.open(file.previous.value?.id),
	arrowright: () => file.open(file.next.value?.id),
	e: file.edit,
	' ': () => void file.fullscreen(),
}))
</script>

<template>
	<div class="flex flex-col gap-4">
		<header class="flex flex-wrap items-start gap-3">
			<UButton icon="i-ph-arrow-left" color="neutral" variant="outline" square :aria-label="t('dms_media.actions.back')" @click="back" />
			<div class="min-w-0 flex-1">
				<USkeleton v-if="!asset && !isUnavailable" class="h-7 w-72" />
				<div v-else-if="asset" class="flex flex-wrap items-center gap-2">
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
					<template v-if="file.index.value >= 0"> · {{ t('dms_media.lightbox.position', { index: file.index.value + 1, total: file.total.value }) }}</template>
				</p>
			</div>
			<div v-if="asset" class="flex flex-wrap items-center gap-2">
				<div class="flex">
					<UButton icon="i-ph-caret-left" color="neutral" variant="outline" square class="rounded-e-none" :disabled="!file.previous.value" :aria-label="t('dms_media.lightbox.previous')" @click="file.open(file.previous.value?.id)" />
					<UButton icon="i-ph-caret-right" color="neutral" variant="outline" square class="-ms-px rounded-s-none" :disabled="!file.next.value" :aria-label="t('dms_media.lightbox.next')" @click="file.open(file.next.value?.id)" />
				</div>
				<UButton icon="i-ph-link" color="neutral" variant="outline" :label="t('dms_media.actions.copy_link')" @click="copyLink" />
				<UButton icon="i-ph-download-simple" color="neutral" variant="outline" :label="t('dms_media.actions.download')" :loading="isDownloading" @click="download" />
				<UButton v-if="file.canWrite.value && isEditableAsset(asset)" icon="i-ph-crop" :label="t('dms_media.actions.edit_image')" @click="file.edit">
					<template #trailing><UKbd value="E" size="sm" variant="subtle" /></template>
				</UButton>
			</div>
		</header>
		<DmsEmptyState
			v-if="isUnavailable"
			variant="error"
			:title="t(file.isDeleted.value ? 'dms_media.file.deleted' : 'dms_media.file.not_found')"
			:description="t(file.isDeleted.value ? 'dms_media.file.deleted_description' : 'dms_media.file.not_found_description')"
			:actions="unavailableActions"
		/>
	</div>
</template>
