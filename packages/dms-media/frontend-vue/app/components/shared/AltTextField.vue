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
const state = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const inputId = useId()

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
// Instant-save feedback as a DMS form row shows it: "Saved" only while the text is the saved one.
const saveState = computed(() => (state.value === 'saved' && isDirty.value ? 'idle' : state.value))

function revert(event: KeyboardEvent): void {
	const field = event.target as HTMLElement
	draft.value = props.asset.alt ?? ''
	field.blur()
}

async function commit(): Promise<void> {
	if (!props.canEdit || !isDirty.value) return
	state.value = 'saving'
	const isSaved = await props.save(draft.value.trim())
	state.value = isSaved ? 'saved' : 'error'
}
</script>

<template>
	<DmsFieldRow :label="t('dms_media.alt.label')" :label-for="inputId" layout="stack" :inset="false" spacing="list">
		<template v-if="compact" #label>
			<DmsEyebrow :label="t('dms_media.alt.label')" tone="muted" />
		</template>
		<template #label-extra>
			<UBadge v-if="asset.alt" :label="t('dms_media.alt.set')" color="success" variant="subtle" size="sm" />
			<UBadge v-else :label="t('dms_media.alt.missing')" color="warning" variant="subtle" size="sm" />
		</template>
		<template v-if="saveState !== 'idle'" #details>
			<DmsSaveStatus :state="saveState" @retry="commit" />
		</template>
		<UFormField>
			<DmsTextarea
				:id="inputId"
				v-model="draft"
				:rows="compact ? 3 : 2"
				autoresize
				:maxlength="MAX_LENGTH"
				:disabled="!canEdit"
				:placeholder="t('dms_media.alt.placeholder')"
				class="w-full"
				@blur="commit"
				@keydown.meta.enter.prevent="commit"
				@keydown.ctrl.enter.prevent="commit"
				@keydown.escape.stop.prevent="revert"
			/>
			<template #help>
				<span class="flex items-center justify-between gap-2 text-[12px]">
					<span class="flex items-center gap-1">
						<UIcon :name="canEdit ? 'i-ph-info' : 'i-ph-lock-simple'" class="size-3.5" />
						{{ canEdit ? t('dms_media.alt.hint') : t('dms_media.alt.read_only') }}
					</span>
					<span class="font-mono">{{ draft.length }}/{{ MAX_LENGTH }}</span>
				</span>
			</template>
		</UFormField>
	</DmsFieldRow>
</template>
