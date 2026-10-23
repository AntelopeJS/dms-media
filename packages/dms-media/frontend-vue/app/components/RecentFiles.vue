<script setup lang="ts">
import type { MediaAsset } from '../types/media'
import AssetThumb from './shared/AssetThumb.vue'

const format = useMediaFormat()
const { t } = useI18n()
// Read again on each library change, its own trigger: the page's refreshes leave it alone.
const recent = useApiData<{ assets: MediaAsset[] }>(MEDIA_READS.recent, { refreshOnPageRefresh: false })
const assets = computed(() => recent.data.value?.assets ?? [])
const { tree, ready } = useLibraryTree()
// Read with the page, with the folders the files' lines name: a client navigation waits for both.
await Promise.all([recent, ready()])
const isLoading = computed(() => !recent.data.value && !recent.error.value)
const isFailed = computed(() => !recent.data.value && Boolean(recent.error.value))
const SKELETONS = 6

onLibraryChange(() => recent.refresh())

const foldersById = computed(() => new Map((tree.value?.folders ?? []).map((folder) => [folder.id, folder])))
</script>

<template>
	<DmsCard v-if="isLoading || isFailed || assets.length > 0" :title="t('dms_media.recent.title')">
		<template #actions>
			<UButton variant="link" size="xs" trailing-icon="i-ph-arrow-right" :label="t('dms_media.recent.view_all')" :to="`${MEDIA_ROUTES.files}?view=recent`" />
		</template>
		<div v-if="isLoading" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
			<!-- Sized like a tile: the 4:3 preview, the name line (13px) and the folder line (11px). -->
			<div v-for="index in SKELETONS" :key="index" class="flex flex-col gap-1.5">
				<USkeleton class="aspect-[4/3] w-full rounded-md" />
				<USkeleton class="h-[19.5px] w-3/4" />
				<USkeleton class="h-[16.5px] w-1/2" />
			</div>
		</div>
		<DmsEmptyState v-else-if="isFailed" variant="error" :title="t('dms_media.empty.error_title')" :description="t('dms_media.empty.error_description')" />
		<ul v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
			<li v-for="asset in assets" :key="asset.id">
				<ULink :to="fileLink(asset.id)" class="group flex flex-col gap-1.5">
					<div class="relative aspect-[4/3] overflow-hidden rounded-md">
						<AssetThumb :asset="asset" size="fill" class="transition-transform group-hover:scale-[1.02]" />
						<span v-if="asset.effectiveVisibility === 'public'" class="absolute end-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-(--dms-surface-card)/90">
							<UIcon name="i-ph-globe" class="text-success size-3" />
						</span>
					</div>
					<p class="text-highlighted truncate text-[13px] font-medium">{{ asset.name }}</p>
					<p class="text-dimmed truncate font-mono text-[11px]">
						{{ foldersById.get(asset.folderId)?.name }} · {{ format.formatBytes(asset.size) }}
					</p>
				</ULink>
			</li>
		</ul>
	</DmsCard>
</template>
