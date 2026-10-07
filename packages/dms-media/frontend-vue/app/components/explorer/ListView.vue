<script setup lang="ts">
import type { MediaAsset } from '../../types/media'
import AssetThumb from '../shared/AssetThumb.vue'

defineProps<{ assets: MediaAsset[] }>()
const { library, commands } = useExplorerContext()
const interactions = useAssetInteractions()
const drop = useExplorerDrop()
const format = useMediaFormat()
const { t } = useI18n()

function folderPath(asset: MediaAsset): string {
	return folderPathLabel(library.tree.foldersById.value.get(asset.folderId), library.tree.foldersById.value)
}

const showPath = computed(() => library.listing.location.value.kind !== 'folder')
const allSelected = computed(
	() => library.listing.assets.value.length > 0 && library.selection.selectedIds.value.size === library.listing.assets.value.length,
)

function toggleAll(): void {
	if (allSelected.value) library.selection.clear()
	else library.selection.selectAll()
}
</script>

<template>
	<table v-if="assets.length" class="w-full text-[13px]" :aria-label="t('dms_media.explorer.files')">
		<thead class="text-dimmed border-default border-b font-mono text-[11px] tracking-wider uppercase">
			<tr>
				<th class="w-10 py-2 ps-2 text-start">
					<UCheckbox v-if="library.mode === 'browse'" :model-value="allSelected" :aria-label="t('dms_media.actions.select_all')" @update:model-value="toggleAll" />
				</th>
				<th class="py-2 text-start font-medium">{{ t('dms_media.columns.name') }}</th>
				<th class="py-2 text-start font-medium max-md:hidden">{{ t('dms_media.columns.type') }}</th>
				<th class="py-2 pe-3 text-end font-medium">{{ t('dms_media.columns.size') }}</th>
				<th class="py-2 text-start font-medium max-lg:hidden">{{ t('dms_media.columns.alt') }}</th>
				<th class="py-2 text-start font-medium max-lg:hidden">{{ t('dms_media.columns.visibility') }}</th>
				<th class="py-2 text-start font-medium max-md:hidden">{{ t('dms_media.columns.modified') }}</th>
				<th class="w-10" />
			</tr>
		</thead>
		<tbody>
			<UContextMenu v-for="asset in assets" :key="asset.id" :items="commands.fileMenu(asset)">
				<tr
					class="border-default border-b transition-colors outline-none last:border-b-0"
					:class="[
						interactions.isSelected(asset) ? 'bg-(--dms-accent-tint)' : 'hover:bg-(--dms-bg-muted) focus-visible:bg-(--dms-bg-muted)',
						interactions.isDisabled(asset) && 'opacity-40',
					]"
					tabindex="0"
					:aria-selected="interactions.isSelected(asset)"
					:draggable="library.mode === 'browse'"
					:data-asset-id="asset.id"
					@click="interactions.onClick($event, asset)"
					@dblclick="interactions.onOpen(asset)"
					@keydown.enter.prevent="interactions.onOpen(asset)"
					@dragstart="drop.startAssetDrag($event, asset)"
					@dragend="drop.endAssetDrag()"
				>
					<td class="py-1.5 ps-2">
						<UCheckbox
							:model-value="interactions.isSelected(asset)"
							:disabled="interactions.isDisabled(asset)"
							:aria-label="t('dms_media.actions.select_file', { name: asset.name })"
							@click.stop
							@update:model-value="interactions.onCheck(asset)"
						/>
					</td>
					<td class="py-1.5">
						<div class="flex items-center gap-2.5">
							<AssetThumb :asset="asset" size="sm" />
							<div class="min-w-0">
								<p class="text-highlighted truncate font-medium">
									{{ asset.name }}
									<UIcon v-if="asset.starred" name="i-ph-star-fill" class="text-warning ms-1 size-3" />
								</p>
								<p v-if="showPath" class="text-dimmed truncate font-mono text-[11px]">
									{{ folderPath(asset) }}
									<span v-if="asset.matchedOn === 'alt'" class="text-primary ms-1 uppercase">{{ t('dms_media.search.matched_alt') }}</span>
								</p>
							</div>
						</div>
					</td>
					<td class="text-muted py-1.5 max-md:hidden">{{ t(`dms_media.type_single.${asset.typeGroup}`) }}</td>
					<td class="text-muted py-1.5 pe-3 text-end font-mono text-xs">{{ format.formatBytes(asset.size) }}</td>
					<td class="py-1.5 max-lg:hidden">
						<template v-if="isImageAsset(asset)">
							<UBadge v-if="asset.alt" :label="t('dms_media.alt.set')" icon="i-ph-check" color="success" variant="subtle" size="sm" />
							<UBadge v-else :label="t('dms_media.alt.missing')" icon="i-ph-text-aa" color="warning" variant="subtle" size="sm" />
						</template>
						<span v-else class="text-dimmed">—</span>
					</td>
					<td class="py-1.5 max-lg:hidden">
						<span v-if="asset.visibility === 'inherit'" class="text-dimmed inline-flex items-center gap-1">
							<UIcon name="i-ph-arrow-elbow-left-up" class="size-3.5" />
							{{ t('dms_media.visibility.folder_short') }}
						</span>
						<span v-else class="inline-flex items-center gap-1" :class="asset.visibility === 'public' ? 'text-success' : 'text-muted'">
							<UIcon :name="asset.visibility === 'public' ? 'i-ph-globe' : 'i-ph-lock-simple'" class="size-3.5" />
							{{ t(`dms_media.visibility.${asset.visibility}`) }}
						</span>
					</td>
					<td class="text-muted py-1.5 max-md:hidden">{{ format.formatRelativeTime(asset.updatedAt) }}</td>
					<td class="py-1.5 pe-2">
						<UDropdownMenu :items="commands.fileMenu(asset)">
							<UButton icon="i-ph-dots-three" color="neutral" variant="ghost" size="xs" square :aria-label="t('dms_media.actions.more')" @click.stop />
						</UDropdownMenu>
					</td>
				</tr>
			</UContextMenu>
		</tbody>
	</table>
</template>
