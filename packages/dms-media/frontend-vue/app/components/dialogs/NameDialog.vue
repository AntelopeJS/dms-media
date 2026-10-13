<script setup lang="ts">
import MediaDialog from '../shared/MediaDialog.vue'

const props = defineProps<{
	title: string
	description?: string
	icon?: string
	label: string
	initial?: string
	suffix?: string
	confirmLabel: string
	/** Names already used next to this one, compared regardless of case. */
	takenNames?: string[]
	/** Saves the name; a refusal it returns stays under the field, the dialog open. */
	submit?: (name: string) => Promise<string | undefined>
}>()
const emit = defineEmits<{ close: [string | null] }>()
const attrs = useAttrs()
const { t } = useI18n()
const name = ref(props.initial ?? '')
const serverError = ref<string>()
const isSaving = ref(false)
const MAX_NAME_LENGTH = 255
const INPUT_ID = 'dms-media-name-input'
const FORBIDDEN = /[\\/<>:"|?*]/
const TYPED_EXTENSION = /\.[a-z0-9]{2,5}$/i

let wasOpen = attrs.open !== false

// The overlay may reuse a mounted dialog: start afresh each time it opens.
onBeforeUpdate(() => {
	const isOpen = attrs.open !== false
	if (isOpen && !wasOpen) {
		name.value = props.initial ?? ''
		serverError.value = undefined
	}
	wasOpen = isOpen
})
watch(name, () => (serverError.value = undefined))

function comparable(value: string): string {
	return value.trim().normalize('NFC').toLocaleLowerCase()
}

const suffix = computed(() => props.suffix ?? '')
const typed = computed(() => {
	const value = name.value.trim()
	const hasSuffix = suffix.value && value.toLowerCase().endsWith(suffix.value.toLowerCase())
	return hasSuffix ? value.slice(0, -suffix.value.length).trim() : value
})
const fullName = computed(() => typed.value + suffix.value)
const taken = computed(() => new Set((props.takenNames ?? []).map(comparable)))

const error = computed(() => {
	if (!typed.value) return t('dms_media.dialogs.name_required')
	if (FORBIDDEN.test(typed.value)) return t('dms_media.dialogs.name_forbidden_chars')
	if (fullName.value.length > MAX_NAME_LENGTH) return t('dms_media.dialogs.name_too_long')
	if (taken.value.has(comparable(fullName.value))) return t('dms_media.dialogs.name_taken')
	return serverError.value
})

const extensionWarning = computed(() => {
	if (!suffix.value || error.value) return undefined
	const extension = TYPED_EXTENSION.exec(typed.value)?.[0]
	return extension ? t('dms_media.dialogs.extension_kept', { extension: suffix.value }) : undefined
})

async function save(): Promise<void> {
	if (error.value || isSaving.value) return
	if (!props.submit) return emit('close', fullName.value)
	isSaving.value = true
	try {
		serverError.value = await props.submit(fullName.value)
	} finally {
		isSaving.value = false
	}
	if (!serverError.value) emit('close', fullName.value)
}
</script>

<template>
	<MediaDialog
		:title="title"
		:description="description"
		:icon="icon"
		size="sm"
		@dismiss="emit('close', null)"
	>
		<form id="dms-media-name-form" class="flex flex-col gap-4" @submit.prevent="save">
			<DmsFieldRow :label="label" :label-for="INPUT_ID" layout="stack" :inset="false" spacing="list" required>
				<UFormField :error="name ? error : undefined">
					<UInput
						:id="INPUT_ID"
						v-model="name"
						data-initial-focus
						:maxlength="MAX_NAME_LENGTH"
						class="w-full"
						:ui="{ trailing: 'pe-1' }"
					>
						<template v-if="suffix" #trailing>
							<span class="text-muted font-mono text-xs">{{ suffix }}</span>
						</template>
					</UInput>
					<template #error="{ error: message }">
						<DmsFormErrorText :error="message" />
					</template>
				</UFormField>
				<p v-if="extensionWarning" class="text-muted mt-1.5 flex items-start gap-1.5 text-[12px]">
					<UIcon name="i-ph-info" class="mt-px size-3.5 shrink-0" />
					{{ extensionWarning }}
				</p>
			</DmsFieldRow>
			<DmsFormRequiredLegend />
		</form>
		<template #footer>
			<UButton color="neutral" variant="outline" :label="t('dms_media.actions.cancel')" @click="emit('close', null)" />
			<UButton type="submit" form="dms-media-name-form" :label="confirmLabel" :loading="isSaving" :disabled="Boolean(error)" />
		</template>
	</MediaDialog>
</template>
