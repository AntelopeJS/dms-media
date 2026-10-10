<script setup lang="ts">
import type { MediaAsset } from '../../types/media'

const props = withDefaults(
	defineProps<{
		asset: MediaAsset
		size?: 'xs' | 'sm' | 'md' | 'lg' | 'fill'
		fit?: 'cover' | 'contain'
	}>(),
	{ size: 'md', fit: 'cover' },
)

const previews = useMediaPreviews()
const hasFailed = ref(false)

onMounted(() => previews.request([props.asset]))
watch(
	() => props.asset.id,
	() => {
		hasFailed.value = false
		previews.request([props.asset])
	},
)

const source = computed(() =>
	hasFailed.value ? undefined : previews.previewOf(props.asset.id),
)
const extension = computed(() => extensionOf(props.asset).toUpperCase())
const sizeClass = computed(
	() =>
		({
			xs: 'size-7 rounded-sm',
			sm: 'size-10 rounded-md',
			md: 'size-14 rounded-md',
			lg: 'size-24 rounded-lg',
			fill: 'size-full',
		})[props.size],
)
const iconClass = computed(() => (props.size === 'xs' || props.size === 'sm' ? 'size-4' : 'size-7'))
</script>

<template>
	<div
		class="relative flex shrink-0 items-center justify-center overflow-hidden bg-(--dms-bg-muted)"
		:class="sizeClass"
	>
		<img
			v-if="source"
			:src="source"
			:alt="asset.alt || ''"
			class="size-full"
			:class="fit === 'cover' ? 'object-cover' : 'object-contain'"
			loading="lazy"
			draggable="false"
			@error="hasFailed = true"
		/>
		<div v-else class="text-dimmed flex flex-col items-center gap-1">
			<UIcon :name="TYPE_GROUP_ICONS[asset.typeGroup]" :class="iconClass" />
			<span
				v-if="size === 'lg' || size === 'fill'"
				class="rounded-sm border border-(--ui-border) px-1 font-mono text-[10px] font-semibold"
			>
				{{ extension }}
			</span>
		</div>
	</div>
</template>
