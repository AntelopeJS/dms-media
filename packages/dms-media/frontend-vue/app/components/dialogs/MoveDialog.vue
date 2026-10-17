<script setup lang="ts">
import type { NameOutcome } from '../../composables/library/useMediaLibrary'
import type { MediaFolder } from '../../types/media'
import FolderPickerTree from '../shared/FolderPickerTree.vue'
import MediaDialog from '../shared/MediaDialog.vue'

const props = defineProps<{
	title: string
	description?: string
	folders: MediaFolder[]
	currentFolderId?: string | null
	/** The folder the tree opens on: where the moved items are. */
	revealId?: string | null
	excludedIds?: string[]
	right: 'write' | 'manage'
	allowRoot?: boolean
	rootAllowed?: boolean
	/** Linked folders take files but no subfolders, unless their binding allows them. */
	refuseBound?: boolean
	/** Folders offered first, the last ones used. */
	recentIds?: readonly string[]
	/** Creates a folder from the dialog, inside the one picked or at the root. */
	createFolder?: (name: string, parentId: string | null) => Promise<NameOutcome>
}>()
const emit = defineEmits<{ close: [string | null | undefined] }>()
const { t } = useI18n()
const target = ref<string | null | undefined>(undefined)
const excluded = computed(() => new Set(props.excludedIds ?? []))
const isCreating = ref(false)
const isSaving = ref(false)
const newName = ref('')
const createError = ref<string>()
const NEW_FOLDER_INPUT = 'dms-media-move-new-folder'

function isAllowed(folder: MediaFolder): string | undefined {
	if (excluded.value.has(folder.id)) return t('dms_media.dialogs.move_inside_itself')
	if (folder.id === props.currentFolderId) return t('dms_media.dialogs.already_here')
	if (props.refuseBound && !folder.acceptsSubfolders) return t('dms_media.dialogs.no_subfolder_in_linked')
	if (!folder.rights[props.right]) return t('dms_media.dialogs.no_right_here')
	return undefined
}

const recentFolders = computed(() =>
	(props.recentIds ?? [])
		.map((id) => props.folders.find((folder) => folder.id === id))
		.filter((folder): folder is MediaFolder => folder !== undefined && !isAllowed(folder)),
)

const canConfirm = computed(() =>
	target.value === null ? Boolean(props.rootAllowed) : target.value !== undefined,
)

const parentName = computed(
	() => props.folders.find((folder) => folder.id === target.value)?.name ?? t('dms_media.library.root'),
)

function confirm(folderId: string | null): void {
	if (folderId === null && !props.rootAllowed) return
	emit('close', folderId)
}

function startCreating(): void {
	isCreating.value = true
	newName.value = ''
	createError.value = undefined
	void nextTick(() => document.getElementById(NEW_FOLDER_INPUT)?.focus())
}

async function create(): Promise<void> {
	const name = newName.value.trim()
	if (!name || !props.createFolder || isSaving.value) return
	isSaving.value = true
	try {
		const outcome = await props.createFolder(name, target.value ?? null)
		createError.value = outcome.fieldError
		if (!outcome.id) return
		isCreating.value = false
		target.value = outcome.id
	} finally {
		isSaving.value = false
	}
}
</script>

<template>
	<MediaDialog
		:title="title"
		:description="description"
		icon="i-ph-arrows-out-cardinal"
		@dismiss="emit('close', undefined)"
	>
		<div class="flex flex-col gap-3">
			<div v-if="recentFolders.length" class="flex flex-wrap items-center gap-1.5">
				<span class="text-muted text-[12px]">{{ t('dms_media.dialogs.move.recent') }}</span>
				<UButton
					v-for="folder in recentFolders"
					:key="folder.id"
					:label="folder.name"
					icon="i-ph-clock-counter-clockwise"
					size="xs"
					color="neutral"
					:variant="target === folder.id ? 'soft' : 'outline'"
					@click="target = folder.id"
				/>
			</div>
			<FolderPickerTree
				v-model="target"
				:folders="folders"
				:is-allowed="isAllowed"
				:allow-root="allowRoot && rootAllowed"
				:reveal-id="revealId"
				@choose="confirm"
			/>
			<form v-if="isCreating" class="flex items-start gap-2" @submit.prevent="create">
				<UFormField class="flex-1" :error="createError" :help="t('dms_media.dialogs.move.new_folder_in', { name: parentName })">
					<UInput
						:id="NEW_FOLDER_INPUT"
						v-model="newName"
						size="sm"
						class="w-full"
						maxlength="255"
						:placeholder="t('dms_media.dialogs.new_folder.label')"
						:aria-label="t('dms_media.dialogs.new_folder.label')"
						@keydown.escape.stop="isCreating = false"
					/>
				</UFormField>
				<UButton type="submit" size="sm" :loading="isSaving" :disabled="!newName.trim()" :label="t('dms_media.dialogs.new_folder.confirm')" />
			</form>
		</div>
		<template #footer>
			<UButton
				v-if="createFolder && !isCreating"
				class="me-auto"
				color="neutral"
				variant="ghost"
				icon="i-ph-folder-plus"
				:label="t('dms_media.actions.new_folder')"
				@click="startCreating"
			/>
			<UButton color="neutral" variant="outline" :label="t('dms_media.actions.cancel')" @click="emit('close', undefined)" />
			<UButton :label="t('dms_media.actions.move_here')" :disabled="!canConfirm" @click="emit('close', target)" />
		</template>
	</MediaDialog>
</template>
