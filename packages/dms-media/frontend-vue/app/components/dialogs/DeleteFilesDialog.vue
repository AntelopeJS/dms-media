<script setup lang="ts">
import type { DeleteFilesChoice, MediaAsset } from '../../types/media'
import AssetThumb from '../shared/AssetThumb.vue'
import MediaDialog from '../shared/MediaDialog.vue'

const props = defineProps<{ assets: MediaAsset[]; canMakePrivate: boolean }>()
const emit = defineEmits<{ close: [DeleteFilesChoice] }>()
const { t } = useI18n()
const format = useMediaFormat()
const SHOWN = 6

const publicAssets = computed(() =>
	props.assets.filter((asset) => asset.effectiveVisibility === 'public'),
)
const size = computed(() => props.assets.reduce((total, asset) => total + asset.size, 0))
</script>

<template>
	<MediaDialog
		:title="t('dms_media.dialogs.delete_files.title', { count: assets.length }, assets.length)"
		:description="t('dms_media.dialogs.delete_files.description', { size: format.formatBytes(size) })"
		icon="i-ph-trash"
		tone="error"
		@dismiss="emit('close', null)"
	>
		<div class="flex flex-col gap-3">
			<ul class="border-default divide-default divide-y overflow-hidden rounded-md border">
				<li
					v-for="asset in assets.slice(0, SHOWN)"
					:key="asset.id"
					class="flex items-center gap-2.5 px-3 py-2 text-sm"
				>
					<AssetThumb :asset="asset" size="xs" />
					<span class="text-highlighted min-w-0 flex-1 truncate">{{ asset.name }}</span>
					<UBadge
						v-if="asset.effectiveVisibility === 'public'"
						:label="t('dms_media.visibility.public')"
						color="success"
						variant="subtle"
						size="sm"
						icon="i-ph-globe"
					/>
					<span class="text-muted font-mono text-xs">{{ format.formatBytes(asset.size) }}</span>
				</li>
				<li v-if="assets.length > SHOWN" class="text-muted px-3 py-2 text-sm">
					{{ t('dms_media.dialogs.delete_files.more', { count: assets.length - SHOWN }) }}
				</li>
			</ul>
			<DmsBanner
				v-if="publicAssets.length"
				tone="warning"
				size="sm"
				:title="t('dms_media.dialogs.delete_files.public_title', { count: publicAssets.length }, publicAssets.length)"
				:description="t('dms_media.dialogs.delete_files.public_description')"
			/>
			<p class="text-muted text-[13px]">
				{{ t('dms_media.dialogs.delete_files.usage_note') }}
			</p>
		</div>
		<template #footer>
			<UButton color="neutral" variant="outline" :label="t('dms_media.actions.cancel')" @click="emit('close', null)" />
			<UButton
				v-if="publicAssets.length && canMakePrivate"
				color="neutral"
				variant="outline"
				icon="i-ph-lock-simple"
				:label="t('dms_media.dialogs.delete_files.make_private')"
				@click="emit('close', 'private')"
			/>
			<UButton color="error" icon="i-ph-trash" :label="t('dms_media.dialogs.delete_files.confirm', { count: assets.length }, assets.length)" @click="emit('close', 'delete')" />
		</template>
	</MediaDialog>
</template>
