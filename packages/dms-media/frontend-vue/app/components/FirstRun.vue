<script setup lang="ts">
import type { FolderVisibility, MediaTree } from '../types/media'

interface StarterFolder {
	key: 'catalog' | 'marketing' | 'brand' | 'documents'
	icon: string
	visibility: FolderVisibility
}

const STARTERS: StarterFolder[] = [
	{ key: 'catalog', icon: 'i-ph-storefront', visibility: 'private' },
	{ key: 'marketing', icon: 'i-ph-megaphone', visibility: 'private' },
	{ key: 'brand', icon: 'i-ph-seal-check', visibility: 'public' },
	{ key: 'documents', icon: 'i-ph-files', visibility: 'private' },
]

const api = useMediaApi()
const { t } = useI18n()
const toast = useToast()
const tree = ref<MediaTree | null>(null)
const isCreating = ref(false)

onMounted(async () => {
	tree.value = await api.tree().catch(() => null)
})

const isEmpty = computed(
	() => tree.value !== null && tree.value.folders.every((folder) => folder.bound) && tree.value.root.fileCount === 0,
)
const canCreate = computed(() => Boolean(tree.value?.root.manage))

async function createStarters(): Promise<void> {
	isCreating.value = true
	try {
		await api.createStarterFolders(
			STARTERS.map((starter) => ({ name: t(`dms_media.first_run.folders.${starter.key}.name`), visibility: starter.visibility })),
		)
		toast.add({ title: t('dms_media.first_run.created'), color: 'success', icon: 'i-ph-folders' })
		await navigateDms(MEDIA_ROUTES.files)
	} catch (error) {
		useApiError(error, { title: t('dms_media.toasts.folder_create_failed') })
	} finally {
		isCreating.value = false
	}
}
</script>

<template>
	<section v-if="isEmpty" class="dms-card flex flex-col items-center gap-4 p-8 text-center">
		<DmsIconWell icon="i-ph-images" tone="primary" size="lg" />
		<div class="max-w-xl">
			<h2 class="text-highlighted text-lg font-semibold">{{ t('dms_media.first_run.title') }}</h2>
			<p class="text-muted mt-1 text-sm">{{ t('dms_media.first_run.description') }}</p>
		</div>
		<div v-if="canCreate" class="grid w-full max-w-2xl gap-2 sm:grid-cols-2">
			<div v-for="starter in STARTERS" :key="starter.key" class="border-default flex items-center gap-3 rounded-md border p-3 text-start">
				<DmsIconWell :icon="starter.icon" tone="muted" size="sm" />
				<div class="min-w-0">
					<p class="text-highlighted text-sm font-medium">{{ t(`dms_media.first_run.folders.${starter.key}.name`) }}</p>
					<p class="text-muted text-[12px]">
						{{ t(`dms_media.first_run.folders.${starter.key}.description`) }} · {{ t(`dms_media.visibility.${starter.visibility}`).toLowerCase() }}
					</p>
				</div>
			</div>
		</div>
		<div class="flex flex-wrap justify-center gap-2">
			<UButton v-if="canCreate" icon="i-ph-folder-plus" :loading="isCreating" :label="t('dms_media.first_run.create', { count: STARTERS.length })" @click="createStarters" />
			<UButton icon="i-ph-folder-open" color="neutral" variant="outline" :label="t('dms_media.overview.open_library')" :to="MEDIA_ROUTES.files" />
		</div>
		<p v-if="canCreate" class="text-dimmed font-mono text-[11px]">{{ t('dms_media.first_run.hint') }}</p>
	</section>
</template>
