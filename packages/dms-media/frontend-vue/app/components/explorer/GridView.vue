<script setup lang="ts">
import type { MediaAsset } from '../../types/media'
import AssetTile from './AssetTile.vue'

defineProps<{ assets: MediaAsset[] }>()
const { library } = useExplorerContext()
const navigation = useAssetNavigation()
const { prefs } = useMediaPrefs()
const { t } = useI18n()

const columns = computed(() => {
	const tile = `${prefs.value.tileSize}px`
	return `repeat(auto-fill, min(${tile}, calc(50% - 4px)))`
})
</script>

<template>
	<section v-if="assets.length" class="flex flex-col gap-2">
		<DmsEyebrow :label="t('dms_media.explorer.files')" tone="muted" />
		<div
			class="grid gap-2"
			role="listbox"
			:aria-multiselectable="library.remaining !== 1"
			:aria-label="t('dms_media.explorer.files')"
			:style="{ gridTemplateColumns: columns }"
			@keydown="navigation.onKeydown"
		>
			<AssetTile v-for="asset in assets" :key="asset.id" :asset="asset" />
		</div>
	</section>
</template>
