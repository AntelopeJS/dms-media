<script setup lang="ts">
import type { MediaFolder } from '../../types/media'
import FolderPickerTree from '../shared/FolderPickerTree.vue'
import MediaDialog from '../shared/MediaDialog.vue'
import NameDialog from './NameDialog.vue'

const props = defineProps<{
	folders: MediaFolder[]
	initialId?: string | null
	count?: number
	/** `pick` only remembers the folder; `upload` goes on to the files. */
	mode?: 'upload' | 'pick'
	/** Types the files must be, for a picker's field: a remembered folder that refuses them is not offered first. */
	accept?: string[]
}>()
const emit = defineEmits<{ close: [string | null] }>()
const { t } = useI18n()
const api = useMediaApi()
const toast = useToast()
const format = useMediaFormat()
const nameDialog = useOverlay().create(NameDialog)
const { tree, reload } = useSharedTree()
const pickerRoot = useTemplateRef<HTMLElement>('pickerRoot')
const isCreating = ref(false)

const folders = computed(() => tree.value?.folders ?? props.folders)
const foldersById = computed(() => new Map(folders.value.map((folder) => [folder.id, folder])))
const target = ref<string | null | undefined>(
	props.folders.find((folder) => folder.id === props.initialId && isFitting(folder))?.id,
)
function isFitting(folder: MediaFolder): boolean {
	return folder.rights.write && coversMimePatterns(folder.accepts, props.accept ?? [])
}

const targetFolder = computed(() => (target.value ? foldersById.value.get(target.value) : undefined))
const canCreate = computed(() =>
	targetFolder.value ? targetFolder.value.rights.manage && !targetFolder.value.bound : Boolean(tree.value?.root.manage),
)
const acceptedLabel = computed(() =>
	targetFolder.value?.accepts?.length ? fieldTypesLabel(targetFolder.value.accepts, t) || targetFolder.value.accepts.join(', ') : '',
)
const remaining = computed(() => {
	const quota = tree.value?.quotaBytes
	return quota ? Math.max(quota - tree.value!.root.size, 0) : null
})
const confirmLabel = computed(() => {
	if (props.mode === 'pick') return t('dms_media.dialogs.destination.use_folder')
	if (props.count) return t('dms_media.dialogs.destination.confirm_count', { count: props.count }, props.count)
	return t('dms_media.dialogs.destination.confirm')
})

function isAllowed(folder: MediaFolder): string | undefined {
	return folder.rights.write ? undefined : t('dms_media.dialogs.no_upload_here')
}

async function createFolder(): Promise<void> {
	const parent = targetFolder.value
	const name = await nameDialog.open({
		title: t('dms_media.dialogs.new_folder.title'),
		description: parent
			? t('dms_media.dialogs.new_folder.inside', { name: parent.name })
			: t('dms_media.dialogs.new_folder.at_root'),
		icon: 'i-ph-folder-plus',
		label: t('dms_media.dialogs.new_folder.label'),
		confirmLabel: t('dms_media.dialogs.new_folder.confirm'),
	})
	if (!name) return
	isCreating.value = true
	try {
		const { id } = await api.createFolder(name, parent?.id)
		await reload()
		target.value = id
	} catch {
		toast.add({ title: t('dms_media.toasts.folder_create_failed'), color: 'error', icon: 'i-ph-warning-circle' })
	} finally {
		isCreating.value = false
	}
}

watch(foldersById, (byId) => {
	if (target.value && !byId.has(target.value)) target.value = undefined
})

const stopFocusing = watch(pickerRoot, (root) => {
	if (!root) return
	stopFocusing()
	setTimeout(() => root.querySelector('input')?.focus())
})

onMounted(() => void reload())
</script>

<template>
	<MediaDialog
		:title="t('dms_media.dialogs.destination.title')"
		:description="t('dms_media.dialogs.destination.description')"
		icon="i-ph-cloud-arrow-up"
		@dismiss="emit('close', null)"
	>
		<div ref="pickerRoot" class="flex flex-col gap-2">
			<FolderPickerTree v-model="target" :folders="folders" :is-allowed="isAllowed" />
			<p v-if="acceptedLabel" class="text-muted flex items-center gap-1.5 text-[13px]">
				<UIcon name="i-ph-link-simple" class="size-3.5 shrink-0" />
				{{ t('dms_media.dialogs.destination.accepts', { name: targetFolder!.name, types: acceptedLabel }) }}
			</p>
			<div class="flex flex-wrap items-center justify-between gap-2">
				<UButton
					v-if="canCreate"
					icon="i-ph-folder-plus"
					color="neutral"
					variant="ghost"
					size="sm"
					:loading="isCreating"
					:label="targetFolder ? t('dms_media.dialogs.destination.new_folder_inside', { name: targetFolder.name }) : t('dms_media.actions.new_folder_root')"
					@click="createFolder"
				/>
				<span v-if="remaining !== null" class="text-dimmed ms-auto font-mono text-[11px]">
					{{ t('dms_media.dialogs.destination.space_left', { size: format.formatBytes(remaining), total: format.formatBytes(tree!.quotaBytes!) }) }}
				</span>
			</div>
		</div>
		<template #footer>
			<UButton color="neutral" variant="outline" :label="t('dms_media.actions.cancel')" @click="emit('close', null)" />
			<UButton
				:icon="mode === 'pick' ? 'i-ph-check' : 'i-ph-upload-simple'"
				:label="confirmLabel"
				:disabled="!targetFolder?.rights.write"
				@click="emit('close', target ?? null)"
			/>
		</template>
	</MediaDialog>
</template>
