<script setup lang="ts">
import type { AccessSubjects, AclEntry, FolderAccessSummary, FolderVisibility, LabelledAclEntry, MediaRight, MediaTree } from '../types/media'
import AccessFolderTree from './access/AccessFolderTree.vue'
import AccessRules from './access/AccessRules.vue'

const api = useMediaApi()
const route = useDmsRoute()
const router = useDmsRouter()
const { t } = useI18n()
const toast = useToast()
const { confirm } = useConfirm()
const tree = ref<MediaTree | null>(null)
const summary = ref<FolderAccessSummary | null>(null)
const subjects = ref<AccessSubjects | null>(null)
const draft = ref<AclEntry[] | null>(null)
const isSaving = ref(false)
const isLoading = ref(false)
const RIGHTS: MediaRight[] = ['read', 'write', 'manage']

const selectedId = computed(() => (typeof route.query.folder === 'string' ? route.query.folder : undefined))
const folder = computed(() => summary.value?.folder)
const foldersById = computed(() => new Map((tree.value?.folders ?? []).map((entry) => [entry.id, entry])))
const isDirty = computed(() => draft.value !== null)
const shownEntries = computed<LabelledAclEntry[]>(() => {
	if (!draft.value) return summary.value?.entries ?? []
	const labels = new Map((summary.value?.entries ?? []).map((entry) => [`${entry.subject.kind}:${entry.subject.id}`, entry]))
	const roles = new Map((subjects.value?.roles ?? []).map((role) => [role.id, role.name]))
	return draft.value.map((entry) => ({
		...entry,
		label: labels.get(`${entry.subject.kind}:${entry.subject.id}`)?.label ?? roles.get(entry.subject.id) ?? entry.subject.id,
		memberCount: labels.get(`${entry.subject.kind}:${entry.subject.id}`)?.memberCount,
	}))
})
const source = computed(() => {
	const current = summary.value
	if (!current) return ''
	if (current.isOwn) return ''
	const link = current.chain.find((entry) => entry.id === current.sourceId)
	return link ? (link.id === null ? t('dms_media.library.root') : link.name) : t('dms_media.library.root')
})

async function loadTree(): Promise<void> {
	tree.value = await api.tree()
	if (!selectedId.value) {
		const first = [...tree.value.folders]
			.sort((left, right) => left.name.localeCompare(right.name))
			.find((entry) => !entry.parentId && !entry.bound && entry.rights.read)
		if (first) select(first.id)
	}
}

async function loadSummary(folderId: string): Promise<void> {
	isLoading.value = true
	draft.value = null
	try {
		summary.value = await api.folderAccess(folderId)
		if (summary.value.canEdit && !subjects.value) subjects.value = await api.accessSubjects().catch(() => null)
	} catch (error) {
		summary.value = null
		useApiError(error, { title: t('dms_media.access.load_failed') })
	} finally {
		isLoading.value = false
	}
}

function select(folderId: string): void {
	void router.replace({ path: route.path, query: { folder: folderId } })
}

function chainName(name: string): string {
	return name.startsWith('$') ? t(name.slice(1)) : name
}

async function saveRules(entries: AclEntry[] | null): Promise<void> {
	if (!folder.value) return
	isSaving.value = true
	try {
		await api.setFolderAcl(folder.value.id, entries)
		toast.add({ title: t('dms_media.access.saved'), color: 'success', icon: 'i-ph-shield-check' })
		await Promise.all([loadSummary(folder.value.id), loadTree()])
	} catch (error) {
		useApiError(error, { title: t('dms_media.access.save_failed') })
	} finally {
		isSaving.value = false
	}
}

function giveOwnRules(): void {
	draft.value = (summary.value?.entries ?? []).map(({ subject, rights }) => ({ subject, rights }))
}

async function inheritFromParent(): Promise<void> {
	if (!folder.value) return
	await confirm({
		title: t('dms_media.access.inherit_title', { name: folder.value.name }),
		description: t('dms_media.access.inherit_description'),
		icon: 'i-ph-arrow-elbow-left-up',
		color: 'warning',
		confirmLabel: t('dms_media.access.inherit_confirm'),
		onConfirm: () => saveRules(null),
	})
}

async function setVisibility(visibility: FolderVisibility): Promise<void> {
	const current = folder.value
	if (!current || current.visibility === visibility) return
	const apply = async () => {
		await api.setFolderVisibility(current.id, visibility)
		toast.add({ title: t('dms_media.access.visibility_saved', { name: current.name }), color: 'success' })
		await Promise.all([loadSummary(current.id), loadTree()])
	}
	if (visibility === 'private') return apply().catch((error) => useApiError(error, { title: t('dms_media.toasts.visibility_failed') }))
	await confirm({
		title: t('dms_media.access.public_title', { name: current.name }),
		description: t('dms_media.access.public_description', { count: summary.value?.directFiles ?? 0 }),
		icon: 'i-ph-globe',
		color: 'warning',
		confirmLabel: t('dms_media.access.public_confirm'),
		impact: current.hasOwnAcl ? [{ icon: 'i-ph-lock-simple', label: t('dms_media.access.public_restricted') }] : undefined,
		onConfirm: apply,
	})
}

watch(selectedId, (id) => id && void loadSummary(id), { immediate: true })
onMounted(() => void loadTree())
</script>

<template>
	<div class="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
		<AccessFolderTree :folders="tree?.folders ?? []" :selected-id="selectedId" @select="select" />
		<div class="flex min-w-0 flex-col gap-4">
			<DmsEmptyState v-if="!selectedId" icon="i-ph-folder-simple" :title="t('dms_media.access.pick_folder')" :description="t('dms_media.access.pick_folder_description')" />
			<template v-else-if="summary && folder">
				<DmsCard>
					<template #header>
						<div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
							<UIcon name="i-ph-folder-simple" class="text-muted size-4" />
							<span class="text-highlighted text-sm font-semibold">{{ folder.name }}</span>
							<span class="text-dimmed font-mono text-[11px]">{{ t('dms_media.explorer.file_count', { count: folder.fileCount }, folder.fileCount) }}</span>
							<UBadge v-if="summary.isOwn" :label="t('dms_media.markers.own_rules')" icon="i-ph-lock-simple" color="warning" variant="subtle" size="sm" />
							<UBadge v-else :label="t('dms_media.access.inherited_from', { name: source })" icon="i-ph-arrow-elbow-left-up" color="neutral" variant="subtle" size="sm" />
							<UBadge v-if="folder.bound" :label="t('dms_media.markers.linked_to', { binding: folder.binding })" icon="i-ph-link-simple" color="primary" variant="subtle" size="sm" />
						</div>
					</template>
					<template #actions>
						<template v-if="summary.canEdit">
							<UButton v-if="summary.isOwn" icon="i-ph-arrow-elbow-left-up" color="neutral" variant="ghost" size="sm" :label="t('dms_media.access.inherit')" @click="inheritFromParent" />
							<UButton v-else-if="!isDirty" icon="i-ph-lock-simple" color="neutral" variant="outline" size="sm" :label="t('dms_media.access.own_rules')" @click="giveOwnRules" />
						</template>
					</template>
					<div class="flex flex-col gap-4">
						<nav class="flex flex-wrap items-center gap-1 text-[13px]" :aria-label="t('dms_media.access.chain')">
							<template v-for="(link, index) in summary.chain" :key="link.id ?? 'root'">
								<UIcon v-if="index > 0" name="i-ph-caret-right" class="text-dimmed size-3" />
								<span
									class="inline-flex items-center rounded-sm px-1.5 py-0.5"
									:class="link.id === summary.sourceId || (link.id === null && summary.sourceId === null) ? 'border border-(--ui-warning) text-warning' : link.id === folder.id ? 'text-highlighted font-medium' : 'text-muted'"
								>
									<UIcon v-if="link.id === null" name="i-ph-house" class="me-1 size-3.5 align-[-2px]" />{{ chainName(link.name) }}
									<template v-if="link.id === summary.sourceId || (link.id === null && summary.sourceId === null)"> · {{ t('dms_media.access.rules_here') }}</template>
								</span>
							</template>
						</nav>
						<div class="grid gap-3 sm:grid-cols-3">
							<div v-for="right in RIGHTS" :key="right" class="border-default rounded-md border p-3">
								<DmsEyebrow :label="t(`dms_media.access.can_${right}`)" tone="muted" />
								<p class="text-highlighted mt-1 text-xl font-semibold">{{ summary.rights[right].count }}</p>
								<div class="mt-1 flex -space-x-1.5">
									<UAvatar v-for="member in summary.rights[right].sample" :key="member.userId" :alt="member.name" size="2xs" class="ring-2 ring-(--dms-surface-card)" />
								</div>
								<p class="text-dimmed mt-1 truncate text-[12px]">{{ summary.rights[right].sample.map((member) => member.name).join(', ') || t('dms_media.access.nobody') }}</p>
							</div>
						</div>
						<DmsBanner v-if="!summary.canEdit" tone="info" size="sm" :title="folder.bound ? t('dms_media.access.linked_read_only') : t('dms_media.access.read_only')" :description="folder.bound ? t('dms_media.access.linked_read_only_description') : t('dms_media.access.read_only_description')" />
					</div>
				</DmsCard>
				<DmsCard :padded="false">
					<AccessRules
						:entries="shownEntries"
						:can-edit="summary.canEdit && (summary.isOwn || isDirty)"
						:subjects="subjects"
						@change="draft = $event"
					/>
					<template v-if="isDirty" #footer>
						<span class="text-muted text-[12px]">{{ t('dms_media.access.unsaved') }}</span>
						<div class="ms-auto flex gap-2">
							<UButton color="neutral" variant="outline" size="sm" :label="t('dms_media.actions.cancel')" @click="draft = null" />
							<UButton size="sm" icon="i-ph-check" :loading="isSaving" :label="t('dms_media.access.save')" @click="saveRules(draft)" />
						</div>
					</template>
				</DmsCard>
				<DmsCard :title="t('dms_media.access.visibility_title')">
					<div class="flex flex-col gap-3">
						<div class="grid gap-3 sm:grid-cols-2">
							<button
								v-for="option in (['private', 'public'] as const)"
								:key="option"
								type="button"
								role="radio"
								:aria-checked="folder.visibility === option"
								:disabled="!summary.canEdit && !(folder.rights.manage && tree?.canManagePermissions)"
								class="border-default flex items-start gap-3 rounded-md border p-3 text-start disabled:cursor-not-allowed disabled:opacity-60"
								:class="folder.visibility === option ? 'border-(--ui-primary) bg-(--dms-accent-tint)' : 'hover:bg-(--dms-bg-muted)'"
								@click="setVisibility(option)"
							>
								<UIcon :name="option === 'public' ? 'i-ph-globe' : 'i-ph-lock-simple'" class="text-muted mt-0.5 size-4" />
								<span class="flex-1">
									<span class="text-highlighted block text-sm font-medium">{{ t(`dms_media.visibility.${option}`) }}</span>
									<span class="text-muted block text-[12px]">{{ t(`dms_media.access.visibility_${option}`) }}</span>
								</span>
							</button>
						</div>
						<DmsBanner
							tone="info"
							size="sm"
							:title="t('dms_media.access.applies_to', { count: summary.directFiles, name: folder.name }, summary.directFiles)"
							:description="summary.overrides.length ? t('dms_media.access.overrides', { count: summary.overrides.length, names: summary.overrides.slice(0, 3).map((entry) => entry.name).join(', ') }, summary.overrides.length) : t('dms_media.access.no_overrides')"
						/>
					</div>
				</DmsCard>
			</template>
			<USkeleton v-else-if="isLoading" class="h-96 w-full rounded-lg" />
		</div>
	</div>
</template>
