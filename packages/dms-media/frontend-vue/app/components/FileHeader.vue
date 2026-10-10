<script setup lang="ts">
const { t } = useI18n()
const toast = useToast()
const config = useDmsRuntimeConfig()
const file = useCurrentFile()
const asset = computed(() => file.asset.value)
const details = computed(() => file.details.value)
const apiOrigin = computed(() => config.public.dms.baseURL ?? '')

function back(): void {
	void navigateDms(asset.value ? folderLink(asset.value.folderId) : MEDIA_ROUTES.files)
}

async function copyLink(): Promise<void> {
	if (!asset.value) return
	await navigator.clipboard.writeText(`${apiOrigin.value}${asset.value.url}`)
	toast.add({ title: t('dms_media.toasts.link_copied'), color: 'success', icon: 'i-ph-link' })
}

async function download(): Promise<void> {
	if (!asset.value) return
	const { url } = await useMediaApi().readUrl(asset.value.id)
	downloadFile(url, asset.value.name)
}

definePageShortcuts(() => ({
	arrowleft: () => file.open(file.previous.value?.id),
	arrowright: () => file.open(file.next.value?.id),
	e: file.edit,
	' ': file.fullscreen,
}))
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
					<UButton icon="i-ph-caret-left" color="neutral" variant="outline" square class="rounded-e-none" :disabled="!file.previous.value" :aria-label="t('dms_media.lightbox.previous')" @click="file.open(file.previous.value?.id)" />
					<UButton icon="i-ph-caret-right" color="neutral" variant="outline" square class="-ms-px rounded-s-none" :disabled="!file.next.value" :aria-label="t('dms_media.lightbox.next')" @click="file.open(file.next.value?.id)" />
				</div>
				<UButton icon="i-ph-link" color="neutral" variant="outline" :label="t('dms_media.actions.copy_link')" @click="copyLink" />
				<UButton icon="i-ph-download-simple" color="neutral" variant="outline" :label="t('dms_media.actions.download')" @click="download" />
				<UButton v-if="file.canWrite.value && isEditableAsset(asset)" icon="i-ph-crop" :label="t('dms_media.actions.edit_image')" @click="file.edit">
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
	</div>
</template>
