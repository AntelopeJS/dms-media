import { createSharedComposable } from '@vueuse/core'
import type { AccessSubjects, AclEntry, FolderAccessSummary, FolderVisibility, LabelledAclEntry, MediaTree } from '../types/media'

/**
 * The state of the access page, named by its `folder` query parameter: one
 * state shared by the page's blocks (folder tree, folder summary, rules,
 * visibility), so a saved rule shows in every one of them.
 */
export const useAccessEditor = createSharedComposable(() => {
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

	return {
		tree,
		summary,
		subjects,
		draft,
		isSaving,
		isLoading,
		selectedId,
		folder,
		foldersById,
		isDirty,
		shownEntries,
		source,
		select,
		chainName,
		saveRules,
		giveOwnRules,
		inheritFromParent,
		setVisibility,
	}
})
