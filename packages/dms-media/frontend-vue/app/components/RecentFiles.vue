<script setup lang="ts">
import type { MediaAsset } from '../types/media'
import AssetThumb from './shared/AssetThumb.vue'

const format = useMediaFormat()
const { t } = useI18n()
// Read again on each library change, its own trigger: the page's refreshes leave it alone.
const recent = useApiData<{ assets: MediaAsset[] }>(MEDIA_READS.recent, { refreshOnPageRefresh: false })
const assets = computed(() => recent.data.value?.assets ?? [])
const { tree } = useLibraryTree()
const isLoading = computed(() => recent.status.value === 'pending' && !recent.data.value)
const SKELETONS = 6

onLibraryChange(() => recent.refresh())

const foldersById = computed(() => new Map((tree.value?.folders ?? []).map((folder) => [folder.id, folder])))
</script>

<template>
	<DmsCard v-if="isLoading || assets.length > 0" :title="t('dms_media.recent.title')">
		<template #actions>
			<UButton variant="link" size="xs" trailing-icon="i-ph-arrow-right" :label="t('dms_media.recent.view_all')" :to="`${MEDIA_ROUTES.files}?view=recent`" />
		</template>
		<div v-if="isLoading" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
			<div v-for="index in SKELETONS" :key="index" class="flex flex-col gap-2">
				<USkeleton class="aspect-[4/3] w-full rounded-md" />
				<USkeleton class="h-3 w-3/4" />
			</div>
		</div>
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
