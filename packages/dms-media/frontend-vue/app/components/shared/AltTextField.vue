<script setup lang="ts">
import type { MediaAsset } from '../../types/media'

const props = defineProps<{
	asset: MediaAsset
	canEdit: boolean
	save: (alt: string) => Promise<boolean>
	compact?: boolean
}>()
const { t } = useI18n()
const MAX_LENGTH = 255
const draft = ref(props.asset.alt ?? '')
const state = ref<'idle' | 'saving' | 'saved' | 'failed'>('idle')

watch(
	() => [props.asset.id, props.asset.alt] as const,
	([, alt]) => {
		if (state.value !== 'saving') draft.value = alt ?? ''
	},
)
watch(
	() => props.asset.id,
	() => (state.value = 'idle'),
)

const isDirty = computed(() => draft.value.trim() !== (props.asset.alt ?? '').trim())

async function commit(): Promise<void> {
	if (!props.canEdit || !isDirty.value) return
	state.value = 'saving'
	const isSaved = await props.save(draft.value.trim())
	state.value = isSaved ? 'saved' : 'failed'
}
</script>

<template>
	<div class="flex flex-col gap-1.5">
		<div class="flex items-center justify-between gap-2">
			<DmsEyebrow v-if="compact" :label="t('dms_media.alt.label')" tone="muted" />
			<span v-else class="text-highlighted text-sm font-medium">{{ t('dms_media.alt.label') }}</span>
			<UBadge
				v-if="asset.alt"
				:label="t('dms_media.alt.set')"
				color="success"
				variant="subtle"
				size="sm"
			/>
			<UBadge v-else :label="t('dms_media.alt.missing')" color="warning" variant="subtle" size="sm" />
		</div>
		<UTextarea
			v-model="draft"
			:rows="compact ? 3 : 2"
			autoresize
			:maxlength="MAX_LENGTH"
			:disabled="!canEdit"
			:placeholder="t('dms_media.alt.placeholder')"
			:aria-label="t('dms_media.alt.label')"
			class="w-full"
			@blur="commit"
			@keydown.meta.enter.prevent="commit"
			@keydown.ctrl.enter.prevent="commit"
		/>
		<div class="text-dimmed flex items-center justify-between gap-2 text-[12px]">
			<span class="flex items-center gap-1">
				<template v-if="state === 'saving'">
					<UIcon name="i-ph-circle-notch" class="size-3.5 animate-spin" />
					{{ t('dms_media.alt.saving') }}
				</template>
				<template v-else-if="state === 'saved' && !isDirty">
					<UIcon name="i-ph-check-circle" class="text-success size-3.5" />
					{{ t('dms_media.alt.saved') }}
				</template>
				<template v-else-if="state === 'failed'">
					<UIcon name="i-ph-warning-circle" class="text-error size-3.5" />
					{{ t('dms_media.alt.failed') }}
				</template>
				<template v-else-if="!canEdit">
					<UIcon name="i-ph-lock-simple" class="size-3.5" />
					{{ t('dms_media.alt.read_only') }}
				</template>
				<template v-else>
					<UIcon name="i-ph-info" class="size-3.5" />
					{{ t('dms_media.alt.hint') }}
				</template>
			</span>
			<span class="font-mono">{{ draft.length }}/{{ MAX_LENGTH }}</span>
		</div>
	</div>
</template>
