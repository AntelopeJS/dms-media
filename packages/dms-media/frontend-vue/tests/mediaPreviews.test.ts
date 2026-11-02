import { afterEach, expect, it, vi } from 'vitest'
import { useMediaApi } from '../app/composables/useMediaApi'

interface PreviewRequest {
	method: string
	query: { ids: string[] }
}

afterEach(() => vi.unstubAllGlobals())

it('reads 150 previews in GET batches of 100 and 50 and merges both responses', async () => {
	const ids = Array.from(
		{ length: 150 },
		(_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
	)
	const authFetch = vi.fn((_url: string, request: PreviewRequest) =>
		Promise.resolve({
			previews: Object.fromEntries(
				request.query.ids.map((id) => [id, `https://media.test/${id}`]),
			),
		}),
	)
	vi.stubGlobal('useAuthFetch', () => ({ $authFetch: authFetch }))

	const result = await useMediaApi().previews(ids)

	expect(authFetch).toHaveBeenCalledTimes(2)
	expect(authFetch).toHaveBeenNthCalledWith(1, '/api/media/previews', {
		method: 'GET',
		query: { ids: ids.slice(0, 100) },
	})
	expect(authFetch).toHaveBeenNthCalledWith(2, '/api/media/previews', {
		method: 'GET',
		query: { ids: ids.slice(100) },
	})
	expect(result.previews).toEqual(
		Object.fromEntries(ids.map((id) => [id, `https://media.test/${id}`])),
	)
})
