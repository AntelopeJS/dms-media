<script lang="ts">
import type { MediaAsset } from '../../types/media'

/** What the picker hands back: the files chosen, and the folder it last showed. */
export interface PickerResult {
	assets: MediaAsset[]
	folderId?: string
}
</script>

<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import type { LibraryLocation } from '../../composables/library/useLibraryListing'
import ExplorerShell from '../explorer/ExplorerShell.vue'
import AssetThumb from '../shared/AssetThumb.vue'

const props = defineProps<{
	multiple?: boolean
	max?: number
	current: number
	accept?: string[]
	startFolderId?: string
	/** The folder a field linked to one is limited to. */
	scopeFolderId?: string
	/** Files the field already holds: they are not counted again. */
	alreadyPicked?: string[]
	/** Where the focus goes once the dialog is gone; the element that had it before, by default. */
	returnFocus?: () => void
}>()
const emit = defineEmits<{ close: [PickerResult | null] }>()
const { t } = useI18n()
const { confirm: confirmDialog } = useConfirm()
const isOpen = ref(true)
const isConfirming = ref(false)
const isNarrow = useMediaQuery('(max-width: 639px)')
const shell = useTemplateRef<InstanceType<typeof ExplorerShell>>('shell')
const lastFolderId = ref<string | undefined>(props.startFolderId)

const remaining = computed(() => {
	if (!props.multiple) return 1
	return props.max === undefined
		? undefined
		: Math.max(props.max - props.current, 0)
})
const initialLocation = computed<LibraryLocation | undefined>(() =>
	props.startFolderId
		? { kind: 'folder', folderId: props.startFolderId }
		: undefined,
)
const library = computed(() => shell.value?.library)
const picked = computed(
	() => library.value?.selection.selectedAssets.value ?? [],
)
const added = computed(() =>
	picked.value.filter((asset) => !props.alreadyPicked?.includes(asset.id)),
)
const isFull = computed(
	() =>
		remaining.value !== undefined &&
		remaining.value !== 1 &&
		picked.value.length >= remaining.value,
)
const totalAfter = computed(() => props.current + added.value.length)
const isImageField = computed(() => {
	const accept = props.accept ?? []
	return (
		accept.length > 0 && accept.every((pattern) => pattern.startsWith('image/'))
	)
})
const acceptedTypes = computed(() => fieldTypesLabel(props.accept ?? [], t))
const canUpload = computed(() => {
	const tree = library.value?.tree.tree.value
	return Boolean(
		tree?.root.write || tree?.folders.some((folder) => folder.rights.write),
	)
})
const confirmLabel = computed(() => {
	const noun = isImageField.value ? 'images' : 'files'
	if (!props.multiple) return t(`dms_media.picker.choose_${noun}`)
	if (added.value.length === 0) return t('dms_media.picker.add_none')
	return t(
		`dms_media.picker.add_${noun}`,
		{ count: added.value.length },
		added.value.length,
	)
})

function onLocation(location: LibraryLocation): void {
	if (location.kind === 'folder') lastFolderId.value = location.folderId
}

function close(assets: MediaAsset[] | null): void {
	isOpen.value = false
	emit('close', { assets: assets ?? [], folderId: lastFolderId.value })
}

function confirm(): void {
	if (added.value.length === 0) return
	close(added.value)
}

/** Escape, a click beside or Cancel with files chosen: asks once, and keeps the choice if the user stays. */
async function confirmDiscard(): Promise<void> {
	if (isConfirming.value) return
	isConfirming.value = true
	const count = added.value.length
	const isDiscarded = await confirmDialog({
		title: t('dms_media.picker.discard_title', { count }, count),
		description: t('dms_media.picker.discard_description', { count }, count),
		color: 'warning',
		icon: 'i-ph-warning',
		confirmLabel: t('dms_media.picker.discard_confirm'),
		cancelLabel: t('dms_media.picker.discard_cancel'),
		initialFocus: 'cancel',
	})
	isConfirming.value = false
	if (isDiscarded) close(null)
}

function onOpenAutoFocus(event: Event): void {
	event.preventDefault()
	void nextTick(() => shell.value?.focusSearch())
}

function onCloseAutoFocus(event: Event): void {
	if (!props.returnFocus) return
	event.preventDefault()
	props.returnFocus()
}

defineShortcuts({ meta_enter: confirm })
</script>

<template>
	<UModal
		v-model:open="isOpen"
		:title="t('dms_media.picker.title')"
		:description="
			canUpload
				? t('dms_media.picker.description_upload')
				: t('dms_media.picker.description_pick')
		"
		:dismissible="added.length === 0"
		:fullscreen="isNarrow"
		:content="{ onOpenAutoFocus, onCloseAutoFocus }"
		:ui="{
			content: isNarrow
				? 'flex flex-col'
				: 'sm:max-w-[min(1280px,96vw)] h-[min(820px,92vh)] flex flex-col',
			body: 'flex min-h-0 flex-1 flex-col p-0 sm:p-0',
		}"
		@update:open="(open: boolean) => !open && close(null)"
		@close:prevent="confirmDiscard"
	>
		<template #body>
			<p
				v-if="acceptedTypes"
				class="text-muted border-default flex items-center gap-1.5 border-b px-4 py-2 text-[12px]"
			>
				<UIcon name="i-ph-funnel-simple" class="size-3.5" />
				{{ t('dms_media.picker.accepts', { types: acceptedTypes }) }}
			</p>
			<ExplorerShell
				ref="shell"
				mode="pick"
				class="min-h-0 flex-1 rounded-none border-0"
				:accept="accept"
				:remaining="remaining"
				:initial-location="initialLocation"
				:scope-folder-id="scopeFolderId"
				:already-picked="alreadyPicked"
				@location="onLocation"
			>
				<template #footer>
					<div
						class="border-default flex flex-wrap items-center gap-3 border-t px-4 py-3"
					>
						<UButton
							v-if="canUpload"
							icon="i-ph-upload-simple"
							color="neutral"
							variant="outline"
							:label="t('dms_media.picker.upload')"
							@click="shell?.upload()"
						/>
						<div class="flex -space-x-2">
							<AssetThumb
								v-for="asset in added.slice(0, 6)"
								:key="asset.id"
								:asset="asset"
								size="sm"
								class="ring-(--dms-surface-card) ring-2"
							/>
						</div>
						<p class="text-muted text-[13px]">
							<template v-if="multiple && max !== undefined">
								{{
									t('dms_media.picker.count_after', {
										picked: added.length,
										total: totalAfter,
										max,
									})
								}}
							</template>
							<template v-else>
								{{
									t(
										'dms_media.picker.count',
										{ count: added.length },
										added.length,
									)
								}}
							</template>
						</p>
						<p
							v-if="isFull"
							class="text-warning flex items-center gap-1 text-[13px]"
						>
							<UIcon name="i-ph-warning" class="size-4" />
							{{ t('dms_media.picker.full_hint') }}
						</p>
						<div class="ms-auto flex gap-2">
							<UButton
								color="neutral"
								variant="outline"
								:label="t('dms_media.actions.cancel')"
								@click="added.length ? confirmDiscard() : close(null)"
							/>
							<UButton
								:disabled="added.length === 0"
								:label="confirmLabel"
								@click="confirm"
							>
								<template #trailing>
									<span
										class="flex gap-0.5 max-sm:hidden [@media(pointer:coarse)]:hidden"
									>
										<UKbd value="meta" size="sm" variant="subtle" />
										<UKbd value="enter" size="sm" variant="subtle" />
									</span>
								</template>
							</UButton>
						</div>
					</div>
				</template>
			</ExplorerShell>
		</template>
	</UModal>
</template>
