<script setup lang="ts">
import type { AssetVisibility, FolderVisibility } from '../../types/media'
import MediaDialog from '../shared/MediaDialog.vue'

const props = defineProps<{
	/** Files changed; ignored for a folder. */
	count?: number
	/** The visibility the files share, or the folder's; nothing when it is mixed. */
	current?: AssetVisibility
	/** The visibility « Same as folder » stands for, when the files share a folder. */
	folderVisibility?: FolderVisibility
	/** Set for a folder: only Private and Public apply to it. */
	folderName?: string
}>()
const emit = defineEmits<{ close: [AssetVisibility | null] }>()
const { t } = useI18n()
const choice = ref<AssetVisibility | undefined>(props.current)
const isFolder = computed(() => props.folderName !== undefined)
const count = computed(() => props.count ?? 0)
const CARDS_UI = { fieldset: 'grid gap-2.5' }
const FOCUS_ORDER = ['[role=radio][data-state=checked]', '[role=radio]']

function choiceLabel(value: AssetVisibility): string {
	if (value !== 'inherit' || !props.folderVisibility) return t(`dms_media.visibility_choice.${value}.label`)
	return t('dms_media.visibility_choice.inherit.label_with', {
		visibility: t(`dms_media.visibility.${props.folderVisibility}`),
	})
}

const options = computed(() =>
	(isFolder.value ? (['private', 'public'] as const) : (['inherit', 'private', 'public'] as const)).map((value) => ({
		value,
		label: choiceLabel(value),
		description: t(`dms_media.visibility_choice.${value}.description`),
	})),
)

const title = computed(() =>
	isFolder.value
		? t('dms_media.dialogs.folder_visibility.title', { name: props.folderName })
		: t('dms_media.dialogs.visibility.title', { count: count.value }, count.value),
)
const description = computed(() =>
	isFolder.value
		? t('dms_media.dialogs.folder_visibility.description', { name: props.folderName })
		: t('dms_media.dialogs.visibility.description'),
)
const becomesPublic = computed(() => choice.value === 'public' && props.current !== 'public')
const publicWarning = computed(() =>
	isFolder.value
		? t('dms_media.dialogs.folder_visibility.public_title', { name: props.folderName })
		: t('dms_media.dialogs.visibility.public_title', { count: count.value }, count.value),
)
const confirmLabel = computed(() =>
	isFolder.value
		? t('dms_media.dialogs.folder_visibility.confirm')
		: t('dms_media.dialogs.visibility.confirm', { count: count.value }, count.value),
)
const canConfirm = computed(() => Boolean(choice.value) && !(isFolder.value && choice.value === props.current))
</script>

<template>
	<MediaDialog
		:title="title"
		:description="description"
		icon="i-ph-globe"
		size="sm"
		:initial-focus="FOCUS_ORDER"
		@dismiss="emit('close', null)"
	>
		<div class="flex flex-col gap-3">
			<URadioGroup
				v-model="choice"
				:items="options"
				variant="card"
				:aria-label="title"
				:ui="CARDS_UI"
			/>
			<DmsBanner
				v-if="becomesPublic"
				tone="warning"
				size="sm"
				:title="publicWarning"
				:description="t('dms_media.dialogs.visibility.public_description')"
			/>
		</div>
		<template #footer>
			<UButton color="neutral" variant="outline" :label="t('dms_media.actions.cancel')" @click="emit('close', null)" />
			<UButton
				:color="becomesPublic ? 'warning' : 'primary'"
				:label="confirmLabel"
				:disabled="!canConfirm"
				@click="emit('close', choice ?? null)"
			/>
		</template>
	</MediaDialog>
</template>
