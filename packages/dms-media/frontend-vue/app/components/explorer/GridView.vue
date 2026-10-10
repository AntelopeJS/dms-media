<script setup lang="ts">
import type { MediaAsset } from '../../types/media'
import AssetTile from './AssetTile.vue'

defineProps<{ assets: MediaAsset[] }>()
const { prefs } = useMediaPrefs()
const { t } = useI18n()
</script>

<template>
	<section v-if="assets.length" class="flex flex-col gap-2">
		<DmsEyebrow :label="t('dms_media.explorer.files')" tone="muted" />
		<div
			class="grid gap-2"
			role="listbox"
			aria-multiselectable="true"
			:aria-label="t('dms_media.explorer.files')"
			:style="{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${prefs.tileSize}px, calc(50% - 4px)), 1fr))` }"
		>
			<AssetTile v-for="asset in assets" :key="asset.id" :asset="asset" />
		</div>
	</section>
</template>
