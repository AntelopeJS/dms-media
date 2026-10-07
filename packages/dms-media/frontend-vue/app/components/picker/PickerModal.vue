<script setup lang="ts">
import type { LibraryLocation } from '../../composables/library/useLibraryListing'
import type { MediaAsset } from '../../types/media'
import ExplorerShell from '../explorer/ExplorerShell.vue'
import AssetThumb from '../shared/AssetThumb.vue'

const props = defineProps<{
	multiple?: boolean
	max?: number
	current: number
	accept?: string[]
	startFolderId?: string
}>()
const emit = defineEmits<{ close: [MediaAsset[] | null] }>()
const { t } = useI18n()
const isOpen = ref(true)
const shell = useTemplateRef<InstanceType<typeof ExplorerShell>>('shell')

const remaining = computed(() => {
	if (!props.multiple) return 1
	return props.max === undefined ? undefined : Math.max(props.max - props.current, 0)
})
const initialLocation = computed<LibraryLocation | undefined>(() =>
	props.startFolderId ? { kind: 'folder', folderId: props.startFolderId } : undefined,
)
const picked = computed(() => shell.value?.library.selection.selectedAssets.value ?? [])
const isFull = computed(() => remaining.value !== undefined && remaining.value !== 1 && picked.value.length >= remaining.value)
const totalAfter = computed(() => props.current + picked.value.length)
const kindLabel = computed(() => {
	const accept = props.accept ?? []
	if (accept.length && accept.every((pattern) => pattern.startsWith('image/'))) return 'images'
	return 'files'
})

function confirm(): void {
	if (picked.value.length === 0) return
	isOpen.value = false
	emit('close', picked.value)
}

function cancel(): void {
	isOpen.value = false
	emit('close', null)
}

defineShortcuts({ meta_enter: confirm })
</script>

<template>
	<UModal
		v-model:open="isOpen"
		:title="t('dms_media.picker.title')"
		:description="t('dms_media.picker.description')"
		:ui="{ content: 'sm:max-w-[min(1280px,96vw)] h-[min(820px,92vh)] flex flex-col', body: 'flex min-h-0 flex-1 flex-col p-0 sm:p-0' }"
		@update:open="(open: boolean) => !open && cancel()"
	>
		<template #body>
			<ExplorerShell
				ref="shell"
				mode="pick"
				class="min-h-0 flex-1 rounded-none border-0"
				:accept="accept"
				:remaining="remaining"
				:initial-location="initialLocation"
			>
				<template #footer>
					<div class="border-default flex flex-wrap items-center gap-3 border-t px-4 py-3">
						<div class="flex -space-x-2">
							<AssetThumb v-for="asset in picked.slice(0, 6)" :key="asset.id" :asset="asset" size="sm" class="ring-2 ring-(--dms-surface-card)" />
						</div>
						<p class="text-muted text-[13px]">
							<template v-if="multiple && max !== undefined">
								{{ t('dms_media.picker.count_after', { picked: picked.length, total: totalAfter, max }) }}
							</template>
							<template v-else>{{ t('dms_media.picker.count', { count: picked.length }, picked.length) }}</template>
						</p>
						<p v-if="isFull" class="text-warning flex items-center gap-1 text-[13px]">
							<UIcon name="i-ph-warning" class="size-4" />{{ t('dms_media.picker.full_hint') }}
						</p>
						<div class="ms-auto flex gap-2">
							<UButton color="neutral" variant="outline" :label="t('dms_media.actions.cancel')" @click="cancel" />
							<UButton
								:disabled="picked.length === 0"
								:label="t(`dms_media.picker.add_${kindLabel}`, { count: picked.length }, picked.length)"
								@click="confirm"
							>
								<template #trailing><UKbd value="meta" size="sm" variant="subtle" /><UKbd value="enter" size="sm" variant="subtle" /></template>
							</UButton>
						</div>
					</div>
				</template>
			</ExplorerShell>
		</template>
	</UModal>
</template>
