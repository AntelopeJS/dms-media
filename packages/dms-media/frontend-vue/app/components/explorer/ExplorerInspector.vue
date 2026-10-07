<script setup lang="ts">
import AltTextField from '../shared/AltTextField.vue'
import AssetThumb from '../shared/AssetThumb.vue'
import FolderGlyph from '../shared/FolderGlyph.vue'
import FolderMarkers from '../shared/FolderMarkers.vue'

const { library, commands } = useExplorerContext()
const format = useMediaFormat()
const { t } = useI18n()

const asset = computed(() => library.selection.focusedAsset.value)
const selectedCount = computed(() => library.selection.selectedAssets.value.length)
const folder = computed(() => {
	const focusedId = library.selection.focusedFolderId.value
	if (focusedId) return library.tree.foldersById.value.get(focusedId)
	return selectedCount.value === 0 ? library.currentFolder.value : undefined
})
const assetFolder = computed(() =>
	asset.value ? library.tree.foldersById.value.get(asset.value.folderId) : undefined,
)
const assetPath = computed(() => folderPathLabel(assetFolder.value, library.tree.foldersById.value))
const canEdit = computed(() => (asset.value ? commands.canWriteAsset(asset.value) : false))
const isBrowse = library.mode === 'browse'

function saveAlt(alt: string): Promise<boolean> {
	return asset.value ? library.actions.setAlt(asset.value, alt) : Promise.resolve(false)
}
</script>

<template>
	<aside class="flex min-h-0 flex-col overflow-y-auto" :aria-label="t('dms_media.explorer.details')">
		<template v-if="asset">
			<div class="border-default border-b p-3">
				<div class="relative overflow-hidden rounded-md">
					<AssetThumb :asset="asset" size="fill" fit="contain" class="aspect-[4/3]" />
					<UButton
						icon="i-ph-arrows-out-simple"
						color="neutral"
						variant="solid"
						size="xs"
						square
						class="absolute end-2 bottom-2"
						:aria-label="t('dms_media.actions.preview')"
						@click="commands.preview(asset)"
					/>
				</div>
				<p class="text-highlighted mt-3 text-sm font-semibold break-all">{{ asset.name }}</p>
				<p class="text-dimmed truncate font-mono text-[11px]">{{ assetPath }}</p>
				<div class="mt-3 flex items-center gap-1.5">
					<UButton
						v-if="isBrowse"
						icon="i-ph-arrow-square-out"
						color="neutral"
						variant="outline"
						size="sm"
						class="flex-1 justify-center"
						:label="t('dms_media.actions.open')"
						@click="commands.openDetails(asset)"
					/>
					<UTooltip v-if="isBrowse && isEditableAsset(asset) && canEdit" :text="t('dms_media.actions.edit_image')" :kbds="['e']">
						<UButton icon="i-ph-crop" color="neutral" variant="outline" size="sm" square :aria-label="t('dms_media.actions.edit_image')" @click="commands.edit(asset)" />
					</UTooltip>
					<UTooltip :text="t('dms_media.actions.copy_link')">
						<UButton icon="i-ph-link" color="neutral" variant="outline" size="sm" square :aria-label="t('dms_media.actions.copy_link')" @click="commands.copyLink(asset)" />
					</UTooltip>
					<UTooltip :text="t('dms_media.actions.download')">
						<UButton icon="i-ph-download-simple" color="neutral" variant="outline" size="sm" square :aria-label="t('dms_media.actions.download')" @click="library.actions.downloadAsset(asset)" />
					</UTooltip>
					<UDropdownMenu :items="commands.fileMenu(asset)">
						<UButton icon="i-ph-dots-three" color="neutral" variant="outline" size="sm" square :aria-label="t('dms_media.actions.more')" />
					</UDropdownMenu>
				</div>
			</div>
			<div v-if="isImageAsset(asset)" class="border-default border-b p-3">
				<AltTextField :asset="asset" :can-edit="canEdit" :save="saveAlt" compact />
			</div>
			<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 p-3 text-[13px]">
				<DmsEyebrow :label="t('dms_media.explorer.details')" tone="muted" class="col-span-2 mb-1" />
				<dt class="text-muted">{{ t('dms_media.columns.type') }}</dt>
				<dd class="text-highlighted text-end">{{ t(`dms_media.type_single.${asset.typeGroup}`) }} · {{ extensionOf(asset).toUpperCase() }}</dd>
				<dt class="text-muted">{{ t('dms_media.columns.size') }}</dt>
				<dd class="text-highlighted text-end font-mono">{{ format.formatBytes(asset.size) }}</dd>
				<template v-if="asset.width && asset.height">
					<dt class="text-muted">{{ t('dms_media.columns.dimensions') }}</dt>
					<dd class="text-highlighted text-end font-mono">{{ format.formatDimensions(asset.width, asset.height) }}</dd>
				</template>
				<dt class="text-muted">{{ t('dms_media.columns.visibility') }}</dt>
				<dd class="text-end">
					<UButton
						v-if="commands.canChangeVisibility(asset)"
						variant="link"
						size="xs"
						class="p-0"
						:icon="asset.effectiveVisibility === 'public' ? 'i-ph-globe' : 'i-ph-lock-simple'"
						:label="t(`dms_media.visibility.${asset.effectiveVisibility}`)"
						@click="commands.changeVisibility([asset])"
					/>
					<span v-else class="text-highlighted">{{ t(`dms_media.visibility.${asset.effectiveVisibility}`) }}</span>
				</dd>
				<dt class="text-muted">{{ t('dms_media.columns.modified') }}</dt>
				<dd class="text-highlighted text-end">{{ format.formatRelativeTime(asset.updatedAt) }}</dd>
				<template v-if="asset.hasOriginal">
					<dt class="text-muted">{{ t('dms_media.columns.original') }}</dt>
					<dd class="text-end"><UBadge :label="t('dms_media.file.preserved')" color="neutral" variant="subtle" size="sm" /></dd>
				</template>
			</dl>
		</template>
		<div v-else-if="selectedCount > 1" class="flex flex-col gap-3 p-4">
			<DmsIconWell icon="i-ph-selection-all" tone="primary" />
			<p class="text-highlighted text-sm font-semibold">{{ t('dms_media.bulk.selected', { count: selectedCount }, selectedCount) }}</p>
			<p class="text-muted text-[13px]">{{ format.formatBytes(library.selection.selectedSize.value) }}</p>
			<div class="grid grid-cols-4 gap-1.5">
				<AssetThumb v-for="entry in library.selection.selectedAssets.value.slice(0, 8)" :key="entry.id" :asset="entry" size="fill" class="aspect-square rounded-sm" />
			</div>
		</div>
		<div v-else-if="folder" class="flex flex-col gap-3 p-4">
			<div class="flex items-center gap-2">
				<FolderGlyph :folder="folder" />
				<p class="text-highlighted min-w-0 flex-1 truncate text-sm font-semibold">{{ folder.name }}</p>
				<FolderMarkers :folder="folder" />
			</div>
			<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
				<dt class="text-muted">{{ t('dms_media.explorer.files') }}</dt>
				<dd class="text-highlighted text-end font-mono">{{ format.formatNumber(folder.fileCount) }}</dd>
				<dt class="text-muted">{{ t('dms_media.columns.size') }}</dt>
				<dd class="text-highlighted text-end font-mono">{{ format.formatBytes(folder.size) }}</dd>
				<dt class="text-muted">{{ t('dms_media.columns.visibility') }}</dt>
				<dd class="text-highlighted text-end">{{ t(`dms_media.visibility.${folder.visibility}`) }}</dd>
				<dt class="text-muted">{{ t('dms_media.inspector.your_rights') }}</dt>
				<dd class="text-highlighted text-end">{{ t(`dms_media.rights.${folder.rights.manage ? 'manage' : folder.rights.write ? 'write' : folder.rights.read ? 'read' : 'none'}`) }}</dd>
			</dl>
			<UButton
				v-if="library.selection.focusedFolderId.value"
				icon="i-ph-folder-open"
				color="neutral"
				variant="outline"
				size="sm"
				:label="t('dms_media.actions.open')"
				@click="library.openFolder(folder.id)"
			/>
			<UButton
				v-if="isBrowse && commands.canManagePermissions.value && folder.rights.manage"
				icon="i-ph-shield-check"
				color="neutral"
				variant="outline"
				size="sm"
				:label="t('dms_media.actions.access')"
				:to="accessLink(folder.id)"
			/>
			<p class="text-dimmed text-[12px]">{{ t('dms_media.inspector.hint') }}</p>
		</div>
		<div v-else class="text-muted flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-[13px]">
			<UIcon name="i-ph-cursor-click" class="text-dimmed size-6" />
			{{ t('dms_media.inspector.hint') }}
		</div>
	</aside>
</template>
