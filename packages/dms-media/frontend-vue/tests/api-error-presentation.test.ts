import { afterEach, expect, it, vi } from 'vitest'
import * as vue from 'vue'
import { useApiErrorPresenter } from '#dms-core/app/composables/useApiErrorPresenter'

afterEach(() => {
	vi.unstubAllGlobals()
	vi.unstubAllEnvs()
})

it.each(['names', 'presign', 'confirm', 'field', 'partial', 'success'])(
	'presents the upload %s outcome without duplicate notices',
	async (stage) => {
		vi.resetModules()
		vi.stubEnv('SSR', false)
		for (const [name, value] of Object.entries(vue)) vi.stubGlobal(name, value)
		const data = { message: 'error.read_only_demo', severity: 'warning' }
		const error = Object.assign(new Error('Forbidden'), {
			response: new Response(JSON.stringify(data), { status: 403 }),
			data,
		})
		const notices = new Map<string | number, { title: string; color: string }>()
		let sequence = 0
		vi.stubGlobal('useToast', () => ({
			add: (notice: { id?: string; title: string; color: string }) => {
				const id = notice.id ?? ++sequence
				notices.set(id, notice)
				return { id }
			},
			update: (id: string | number, notice: { title: string; color: string }) =>
				notices.set(id, notice),
			remove: (id: string | number) => notices.delete(id),
		}))
		vi.stubGlobal('getPluginI18n', () => ({
			i18n: {
				tm: (key: string) =>
					key === 'error.read_only_demo' ? 'This demo is read-only' : key,
				rt: (message: string) => message,
			},
		}))
		const state = vue.ref(new WeakMap())
		vi.stubGlobal('useDmsState', () => state)
		vi.stubGlobal('useApiErrorPresenter', useApiErrorPresenter)
		vi.stubGlobal('useI18n', () => ({ t: (key: string) => key }))
		vi.stubGlobal('useConfirm', () => ({ confirm: async () => false }))
		vi.stubGlobal('onBeforeUnmount', () => undefined)
		vi.stubGlobal('useUploadFailureText', () => () => 'Upload failed')
		vi.stubGlobal('apiErrorStatus', () => 403)
		vi.stubGlobal(
			'uploadLimits',
			vue.ref({ maxUploadBytes: 1000, allowedMimetypes: null }),
		)
		vi.stubGlobal('isActiveDocument', () => false)
		vi.stubGlobal('newBatchId', () => 'batch-1')
		vi.stubGlobal(
			'XMLHttpRequest',
			class {
				upload = {}
				status = 200
				onload = () => undefined
				open() {}
				send() {
					this.onload()
				}
			},
		)
		vi.stubGlobal('useUploadApi', () => ({
			freeNames: async () => {
				if (stage === 'names' || stage === 'field') throw error
				return { names: [null, null] }
			},
			presign: async (_folderId: string, file: File) => {
				if (
					stage === 'presign' ||
					(stage === 'partial' && file.name === 'world.txt')
				)
					throw error
				return { resourceKey: 'key', uploadUrl: '/storage', headers: {} }
			},
			confirm: async () => {
				if (stage === 'partial' || stage === 'success')
					return { asset: { id: 'asset-1' } }
				throw error
			},
			abort: async () => undefined,
			reportBatch: async () => undefined,
		}))
		const { useUploadQueue } = await import('../app/composables/useUploadQueue')
		vi.stubGlobal('useUploadQueue', useUploadQueue)
		const { useUploadToasts } =
			await import('../app/composables/useUploadToasts')
		vi.stubGlobal('useUploadToasts', useUploadToasts)
		const queue = useUploadQueue()
		const toasts = useUploadToasts()
		const settled = new Promise<void>((resolve) =>
			queue.onBatchSettled(() => resolve()),
		)
		const files = [
			new File(['hello'], 'hello.txt'),
			new File(['world'], 'world.txt'),
		]
		const destination = { folderId: 'folder-1', folderName: 'Docs' }
		if (stage === 'field') {
			const { useAssetFieldUploads } =
				await import('../app/composables/useAssetFieldUploads')
			await useAssetFieldUploads({
				accept: () => undefined,
				destination: () => destination,
				room: () => undefined,
				onUploaded: () => undefined,
			}).upload(files)
		} else {
			const batchId = queue.enqueue(files, destination)
			toasts.announce(batchId, 2, 'Docs')
		}
		await settled
		await vue.nextTick()
		expect(
			[...notices.values()].map(({ title, color }) => ({ title, color })),
		).toEqual([
			stage === 'success'
				? { title: 'dms_media.toasts.upload_added', color: 'success' }
				: { title: 'This demo is read-only', color: 'warning' },
		])
	},
)
