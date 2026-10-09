<script setup lang="ts">
import type { AssetVisibility, DeleteFilesChoice } from '../types/media'
import DeleteFilesDialog from './dialogs/DeleteFilesDialog.vue'
import MoveDialog from './dialogs/MoveDialog.vue'
import FileVisibility from './file/FileVisibility.vue'
import AltTextField from './shared/AltTextField.vue'

const { t } = useI18n()
const overlay = useOverlay()
const moveDialog = overlay.create(MoveDialog)
const deleteDialog = overlay.create(DeleteFilesDialog)
const file = useCurrentFile()
const asset = computed(() => file.asset.value)
const details = computed(() => file.details.value)
const nameDraft = ref('')
const extension = computed(() => (asset.value ? extensionOf(asset.value) : ''))
const hasExtension = computed(() => Boolean(asset.value?.name.toLowerCase().endsWith(`.${extension.value}`)))

watch(
	asset,
	(current) => {
		if (current) nameDraft.value = baseNameOf(current)
	},
	{ immediate: true },
)

async function saveName(): Promise<void> {
	if (!asset.value) return
	const name = nameDraft.value.trim()
	if (!name) {
		nameDraft.value = baseNameOf(asset.value)
		return
	}
	await file.rename(hasExtension.value ? `${name}.${extension.value}` : name)
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
</script>

<template>
	<div v-if="asset && details" class="flex flex-col gap-5">
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
