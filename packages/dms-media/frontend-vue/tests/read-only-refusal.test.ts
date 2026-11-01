import { afterEach, expect, it, vi } from 'vitest'
import * as vue from 'vue'

afterEach(() => vi.unstubAllGlobals())

interface Notice {
	title: string
}

it.each([true, false])(
	'does not add an upload failure notice for a marked 403 (%s)',
	async (marked) => {
		vi.resetModules()
		for (const [name, value] of Object.entries(vue)) vi.stubGlobal(name, value)
		const error = Object.assign(new Error('Forbidden'), {
			response: new Response(null, {
				status: 403,
				headers: marked ? { 'x-dms-readonly': '1' } : {},
			}),
		})
		const notices: string[] = []
		const presented = new WeakSet<Response>()
		const consume = (failure: unknown) => {
			if (failure !== error || !marked) return false
			if (!presented.has(error.response)) notices.push('read-only')
			presented.add(error.response)
			return true
		}
		vi.stubGlobal('useReadOnlyRefusal', () => consume)
		vi.stubGlobal('useI18n', () => ({ t: (key: string) => key }))
		vi.stubGlobal('useConfirm', () => ({ confirm: async () => false }))
		vi.stubGlobal('useToast', () => ({
			add: (notice: Notice) => {
				if (notice.title !== 'dms_media.toasts.uploading') notices.push('local')
			},
			remove: () => undefined,
		}))
		vi.stubGlobal('useUploadFailureText', () => () => 'Forbidden')
		vi.stubGlobal('apiErrorStatus', () => 403)
		vi.stubGlobal(
			'uploadLimits',
			vue.ref({ maxUploadBytes: 1000, allowedMimetypes: null }),
		)
		vi.stubGlobal('isActiveDocument', () => false)
		vi.stubGlobal('newBatchId', () => 'batch-1')
		vi.stubGlobal('useUploadApi', () => ({
			freeNames: async () => {
				consume(error)
				throw error
			},
			reportBatch: async () => undefined,
		}))
		const { useUploadQueue } = await import('../app/composables/useUploadQueue')
		vi.stubGlobal('useUploadQueue', useUploadQueue)
		const { useUploadToasts } =
			await import('../app/composables/useUploadToasts')
		const queue = useUploadQueue()
		const toasts = useUploadToasts()
		const settled = new Promise<void>((resolve) =>
			queue.onBatchSettled(() => resolve()),
		)
		const batchId = queue.enqueue([new File(['hello'], 'hello.txt')], {
			folderId: 'folder-1',
			folderName: 'Docs',
		})
		toasts.announce(batchId, 1, 'Docs')
		await settled
		expect(notices).toEqual([marked ? 'read-only' : 'local'])
	},
)
