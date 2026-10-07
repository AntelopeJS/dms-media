<script setup lang="ts">
import type { AssetVisibility, MediaAsset, MediaFolder } from '../../types/media'

const props = defineProps<{ asset: MediaAsset; folder: MediaFolder; canChange: boolean }>()
const emit = defineEmits<{ change: [AssetVisibility] }>()
const { t } = useI18n()

const options = computed(() => [
	{
		value: 'inherit' as const,
		icon: 'i-ph-arrow-elbow-left-up',
		label: t('dms_media.visibility_choice.inherit.label'),
		description: t('dms_media.file.inherit_detail', {
			name: props.folder.name,
			visibility: t(`dms_media.visibility.${props.folder.visibility}`).toLowerCase(),
		}),
	},
	{ value: 'public' as const, icon: 'i-ph-globe', label: t('dms_media.visibility_choice.public.label'), description: t('dms_media.visibility_choice.public.description') },
	{ value: 'private' as const, icon: 'i-ph-lock-simple', label: t('dms_media.visibility_choice.private.label'), description: t('dms_media.visibility_choice.private.description') },
])
</script>

<template>
	<div class="flex flex-col gap-2" role="radiogroup" :aria-label="t('dms_media.columns.visibility')">
		<button
			v-for="option in options"
			:key="option.value"
			type="button"
			role="radio"
			:aria-checked="asset.visibility === option.value"
			:disabled="!canChange"
			class="border-default flex items-start gap-3 rounded-md border p-3 text-start transition-colors disabled:cursor-not-allowed"
			:class="asset.visibility === option.value ? 'border-(--ui-primary) bg-(--dms-accent-tint)' : 'hover:bg-(--dms-bg-muted) disabled:opacity-60'"
			@click="asset.visibility !== option.value && emit('change', option.value)"
		>
			<UIcon :name="option.icon" class="text-muted mt-0.5 size-4 shrink-0" />
			<span class="min-w-0 flex-1">
				<span class="text-highlighted block text-sm font-medium">{{ option.label }}</span>
				<span class="text-muted block text-[12px]">{{ option.description }}</span>
			</span>
			<span
				class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border"
				:class="asset.visibility === option.value ? 'border-(--ui-primary)' : 'border-(--ui-border-accented)'"
			>
				<span v-if="asset.visibility === option.value" class="size-2 rounded-full bg-(--ui-primary)" />
			</span>
		</button>
		<p v-if="!canChange" class="text-dimmed flex items-center gap-1 text-[12px]">
			<UIcon name="i-ph-lock-simple" class="size-3.5" />{{ t('dms_media.file.visibility_locked') }}
		</p>
	</div>
</template>
