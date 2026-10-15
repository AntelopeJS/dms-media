<script setup lang="ts">
import type { AssetVisibility, DeleteFilesChoice } from '../types/media'
import DeleteFilesDialog from './dialogs/DeleteFilesDialog.vue'
import MoveDialog from './dialogs/MoveDialog.vue'
import FileVisibility from './file/FileVisibility.vue'
import AltTextField from './shared/AltTextField.vue'

const NAME_INPUT_ID = 'dms-media-file-name'
const NAME_MAX_LENGTH = 255

const { t } = useI18n()
const overlay = useOverlay()
const moveDialog = overlay.create(MoveDialog)
const deleteDialog = overlay.create(DeleteFilesDialog)
const assetLink = useAssetLink()
const file = useCurrentFile()
const asset = computed(() => file.asset.value)
const details = computed(() => file.details.value)
/** What the reader typed in the name field; the file's own name until then, so a server render shows it. */
const typedName = ref<string | null>(null)
const nameDraft = computed({
	get: () => typedName.value ?? (asset.value ? baseNameOf(asset.value) : ''),
	set: (value: string) => {
		typedName.value = value
	},
})
const extension = computed(() => (asset.value ? extensionOf(asset.value) : ''))
const hasExtension = computed(() => Boolean(asset.value?.name.toLowerCase().endsWith(`.${extension.value}`)))
const nameMaxLength = computed(() => NAME_MAX_LENGTH - (hasExtension.value ? extension.value.length + 1 : 0))
const typedExtension = computed(() => {
	const dot = nameDraft.value.lastIndexOf('.')
	return hasExtension.value && dot > 0 ? nameDraft.value.slice(dot + 1).trim().toLowerCase() : ''
})
const keepsFormatHint = computed(() =>
	typedExtension.value && typedExtension.value !== extension.value
		? t('dms_media.file.extension_kept', { extension: extension.value.toUpperCase() })
		: t('dms_media.dialogs.rename.file_description'),
)

watch(
	() => [asset.value?.id, asset.value?.name],
	() => {
		typedName.value = null
	},
)

/** `banner.jpg` typed on a JPG keeps one `.jpg`, rather than saving `banner.jpg.jpg`. */
function draftBaseName(): string {
	const name = nameDraft.value.trim()
	const suffix = `.${extension.value}`
	const typedSameExtension = hasExtension.value && name.toLowerCase().endsWith(suffix) && name.length > suffix.length
	return typedSameExtension ? name.slice(0, -suffix.length) : name
}

async function saveName(): Promise<void> {
	if (!asset.value) return
	const name = draftBaseName()
	if (!name) {
		nameDraft.value = baseNameOf(asset.value)
		return
	}
	nameDraft.value = name
	await file.rename(hasExtension.value ? `${name}.${extension.value}` : name)
}

async function move(): Promise<void> {
	if (!asset.value) return
	await file.refreshTree()
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

function becomesPublic(visibility: AssetVisibility): boolean {
	if (!asset.value || asset.value.effectiveVisibility === 'public') return false
	return visibility === 'public' || (visibility === 'inherit' && details.value?.folder.visibility === 'public')
}

async function changeVisibility(visibility: AssetVisibility): Promise<void> {
	if (!asset.value) return
	if (becomesPublic(visibility) && !(await assetLink.confirmMakePublic(asset.value))) return
	await file.setVisibility(visibility)
}
</script>

<template>
	<div v-if="asset && details" class="flex flex-col gap-5">
		<DmsFieldRow :label="t('dms_media.columns.name')" :label-for="NAME_INPUT_ID" layout="stack" :inset="false" spacing="list">
			<UFormField :help="keepsFormatHint">
				<UInput
					:id="NAME_INPUT_ID"
					v-model="nameDraft"
					class="w-full"
					:maxlength="nameMaxLength"
					:disabled="!file.canWrite.value"
					@blur="saveName"
					@keydown.enter.prevent="saveName"
				>
					<template v-if="hasExtension" #trailing>
						<span class="text-muted font-mono text-xs">.{{ extension }}</span>
					</template>
				</UInput>
			</UFormField>
		</DmsFieldRow>
		<AltTextField v-if="isImageAsset(asset)" :asset="asset" :can-edit="file.canWrite.value" :save="file.setAlt" />
		<DmsFieldRow :label="t('dms_media.file.folder')" layout="stack" :inset="false" spacing="list">
			<div class="flex gap-2">
				<div class="border-default flex min-w-0 flex-1 items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
					<UIcon name="i-ph-folder-simple" class="text-muted size-4" />
					<span class="text-highlighted truncate">{{ details.folder.name }}</span>
					<span class="text-dimmed truncate font-mono text-[11px]">{{ pathLabel(details.path.slice(0, -1)) }}</span>
				</div>
				<UButton v-if="file.canWrite.value" color="neutral" variant="outline" :label="t('dms_media.file.move')" @click="move" />
			</div>
		</DmsFieldRow>
		<DmsFieldRow :label="t('dms_media.columns.visibility')" layout="stack" :inset="false" spacing="list">
			<FileVisibility :asset="asset" :folder="details.folder" :can-change="file.canChangeVisibility.value" @change="changeVisibility" />
		</DmsFieldRow>
		<div v-if="file.canWrite.value" class="border-default flex items-center justify-between gap-2 border-t pt-3">
			<UButton icon="i-ph-trash" color="error" variant="ghost" size="sm" :label="t('dms_media.file.delete')" @click="remove" />
			<span class="text-dimmed ms-auto text-[12px]">{{ t('dms_media.file.autosave') }}</span>
		</div>
		<DmsEyebrow :label="t('dms_media.file.information')" tone="muted" class="-mb-3" />
	</div>
	<div v-else-if="!file.error.value" class="flex flex-col gap-4">
		<USkeleton v-for="index in 3" :key="index" class="h-10 w-full" />
	</div>
</template>
