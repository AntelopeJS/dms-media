<script setup lang="ts">
import type { MediaAsset } from '../../types/media'
import AssetThumb from '../shared/AssetThumb.vue'

const props = defineProps<{ asset: MediaAsset }>()
const { library, commands } = useExplorerContext()
const interactions = useAssetInteractions()
const drop = useExplorerDrop()
const format = useMediaFormat()
const { t } = useI18n()

const isSelected = computed(() => interactions.isSelected(props.asset))
const isDisabled = computed(() => interactions.isDisabled(props.asset))
const isDragged = computed(() => drop.draggedIds.value.includes(props.asset.id))
const showCheck = computed(() => interactions.hasSelection.value || isSelected.value)
const menu = computed(() => commands.fileMenu(props.asset))
const isBrowse = library.mode === 'browse'
</script>

<template>
	<UContextMenu :items="menu">
		<UTooltip :text="interactions.disabledReason(asset)" :disabled="!interactions.disabledReason(asset)">
			<div
				class="group relative flex flex-col gap-1.5 rounded-lg p-1.5 transition-colors outline-none"
				:class="[
					isSelected ? 'bg-(--dms-accent-tint) ring-primary ring-2' : 'hover:bg-(--dms-bg-muted) focus-visible:ring-primary focus-visible:ring-2',
					isDisabled && 'cursor-not-allowed opacity-40',
					isDragged && 'opacity-50',
				]"
				role="option"
				tabindex="0"
				:aria-selected="isSelected"
				:aria-disabled="isDisabled"
				:draggable="isBrowse"
				:data-asset-id="asset.id"
				@click="interactions.onClick($event, asset)"
				@dblclick="interactions.onOpen(asset)"
				@keydown.enter.prevent="interactions.onOpen(asset)"
				@dragstart="drop.startAssetDrag($event, asset)"
				@dragend="drop.endAssetDrag()"
			>
				<div class="relative aspect-square overflow-hidden rounded-md">
					<AssetThumb :asset="asset" size="fill" />
					<UCheckbox
						:model-value="isSelected"
						class="absolute start-2 top-2 rounded-sm bg-(--dms-surface-card) transition-opacity"
						:class="showCheck ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'"
						:aria-label="t('dms_media.actions.select_file', { name: asset.name })"
						:disabled="isDisabled"
						@click.stop
						@update:model-value="interactions.onCheck(asset)"
					/>
					<span
						v-if="asset.effectiveVisibility === 'public'"
						class="absolute end-2 top-2 flex size-6 items-center justify-center rounded-full bg-(--dms-surface-card)/90"
						:title="t('dms_media.visibility.public')"
					>
						<UIcon name="i-ph-globe" class="text-success size-3.5" />
					</span>
					<span
						v-if="asset.starred"
						class="absolute end-2 bottom-2 flex size-6 items-center justify-center rounded-full bg-(--dms-surface-card)/90"
					>
						<UIcon name="i-ph-star-fill" class="text-warning size-3.5" />
					</span>
					<span
						v-if="asset.typeGroup === 'video'"
						class="absolute start-2 bottom-2 flex size-7 items-center justify-center rounded-full bg-black/55 text-white"
					>
						<UIcon name="i-ph-play-fill" class="size-3.5" />
					</span>
				</div>
				<div class="min-w-0 px-0.5">
					<p class="truncate text-[13px] font-medium" :class="isSelected ? 'text-primary' : 'text-highlighted'" :title="asset.name">
						{{ asset.name }}
					</p>
					<p class="text-dimmed flex items-center gap-1.5 font-mono text-[11px]">
						<span>{{ format.formatBytes(asset.size) }}</span>
						<span v-if="needsAltText(asset)" class="text-warning flex items-center gap-0.5">
							<UIcon name="i-ph-text-aa" class="size-3" />
							{{ t('dms_media.markers.no_alt') }}
						</span>
						<span v-if="asset.matchedOn === 'alt'" class="text-primary uppercase">{{ t('dms_media.search.matched_alt') }}</span>
					</p>
				</div>
			</div>
		</UTooltip>
	</UContextMenu>
</template>
