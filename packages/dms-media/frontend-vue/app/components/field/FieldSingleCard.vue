<script setup lang="ts">
import type { AssetFieldEntry } from '../../composables/useAssetFieldEntries'
import type { MediaAsset } from '../../types/media'
import AssetThumb from '../shared/AssetThumb.vue'
import FieldAltPopover from './FieldAltPopover.vue'

defineProps<{
	entry: AssetFieldEntry
	disabled?: boolean
	canEditAlt: (asset: MediaAsset) => boolean
	/** Id and ARIA attributes of the field, carried by the Replace button. */
	controlId?: string
	controlAria?: Record<string, unknown>
}>()
const emit = defineEmits<{
	replace: []
	remove: []
	preview: []
	altSaved: [MediaAsset]
}>()
const { t } = useI18n()
const format = useMediaFormat()
</script>

<template>
	<div
		class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border p-2.5"
		:aria-busy="entry.loading"
		:class="[
			disabled && 'opacity-60',
			entry.missing ? 'border-(--ui-error)/40 border-dashed' : 'border-default',
		]"
	>
		<button
			v-if="entry.asset"
			type="button"
			class="shrink-0 rounded-md"
			:aria-label="
				t('dms_media.field_widget.menu.preview_named', {
					name: entry.asset.name,
				})
			"
			@click="emit('preview')"
		>
			<AssetThumb :asset="entry.asset" size="md" />
		</button>
		<USkeleton v-else-if="entry.loading" class="size-14 shrink-0 rounded-md" />
		<DmsIconWell v-else icon="i-ph-file-x" tone="error" />
		<div class="min-w-0 flex-1 basis-40">
			<template v-if="entry.asset">
				<p
					class="text-highlighted truncate text-sm font-medium"
					:title="entry.asset.name"
				>
					{{ entry.asset.name }}
				</p>
				<p
					class="text-dimmed flex flex-wrap items-center gap-x-1.5 font-mono text-[11px]"
				>
					<span v-if="entry.asset.width">
						{{ format.formatDimensions(entry.asset.width, entry.asset.height) }}
						·
					</span>
					<span>{{ format.formatBytes(entry.asset.size) }} ·</span>
					<span
						:class="
							entry.asset.effectiveVisibility === 'public' ? 'text-success' : ''
						"
					>
						{{ t(`dms_media.visibility.${entry.asset.effectiveVisibility}`) }}
					</span>
					<FieldAltPopover
						v-if="isImageAsset(entry.asset)"
						:asset="entry.asset"
						:can-edit="!disabled && canEditAlt(entry.asset)"
						@saved="emit('altSaved', $event)"
					/>
				</p>
			</template>
			<template v-else-if="entry.loading">
				<USkeleton class="h-4 w-40 max-w-full" />
				<USkeleton class="mt-1.5 h-3 w-28" />
			</template>
			<template v-else>
				<p class="text-error text-sm font-medium">
					{{ t('dms_media.field_widget.missing.title') }}
				</p>
				<p class="text-muted text-[12px]">
					{{ t('dms_media.field_widget.missing.hint') }}
				</p>
			</template>
		</div>
		<div v-if="!disabled" class="ms-auto flex shrink-0 items-center gap-1.5">
			<UButton
				:id="controlId"
				v-bind="controlAria"
				icon="i-ph-swap"
				color="neutral"
				variant="outline"
				size="sm"
				:aria-label="
					t('dms_media.field_widget.replace_named', {
						name: entry.asset?.name ?? '',
					})
				"
				@click="emit('replace')"
			>
				<span class="max-sm:sr-only">
					{{ t('dms_media.field_widget.replace') }}
				</span>
			</UButton>
			<UButton
				icon="i-ph-x"
				color="neutral"
				variant="ghost"
				size="sm"
				square
				:aria-label="
					t('dms_media.field_widget.remove', { name: entry.asset?.name ?? '' })
				"
				@click="emit('remove')"
			/>
		</div>
	</div>
</template>
