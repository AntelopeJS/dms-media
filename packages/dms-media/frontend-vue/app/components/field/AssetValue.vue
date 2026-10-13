<script setup lang="ts">
import type { MediaAsset } from '../../types/media'
import AssetThumb from '../shared/AssetThumb.vue'

const props = defineProps<{ value: unknown }>()
const { t } = useI18n()
const api = useMediaApi()
const assets = ref<(MediaAsset | null)[]>([])

const SHOWN_NAMES = 2

const ids = computed<string[]>(() => {
	if (typeof props.value === 'string') return [props.value]
	return Array.isArray(props.value)
		? props.value.filter((entry): entry is string => typeof entry === 'string')
		: []
})
const shownIds = computed(() => ids.value.slice(0, SHOWN_NAMES))
const hidden = computed(() => Math.max(ids.value.length - SHOWN_NAMES, 0))

/** Only the files the cell names are read: the others are counted. */
watch(
	shownIds,
	async (list) => {
		assets.value = await Promise.all(
			list.map((id) =>
				api
					.asset(id)
					.then((response) => response.asset)
					.catch(() => null),
			),
		)
	},
	{ immediate: true },
)
</script>

<template>
	<span
		class="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 align-middle"
	>
		<span
			v-for="(asset, index) in assets"
			:key="ids[index]"
			class="inline-flex min-w-0 items-center gap-1"
		>
			<AssetThumb v-if="asset" :asset="asset" size="xs" />
			<span class="truncate" :class="!asset && 'text-error'">
				{{ asset?.name ?? t('dms_media.field_widget.missing.title') }}
			</span>
		</span>
		<span v-if="hidden" class="text-dimmed">
			{{ t('dms_media.field_widget.more', { count: hidden }) }}
		</span>
	</span>
</template>
