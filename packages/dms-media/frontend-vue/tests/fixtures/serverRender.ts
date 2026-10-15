/**
 * Server renders of the module's blocks on the renderer's real data layer
 * (`#dms/frontend-module`) and the DMS's real `useApiData`, as the generated
 * application runs them: what each render reads from the backend, and what it
 * hands the browser with the page.
 */
import * as vue from 'vue'
import { createSSRApp, h, type Component } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { vi } from 'vitest'
import type { DmsPayload } from '#dms/frontend-module'

const engine = await import('#dms/frontend-module')

/** A backend request a render made. */
export interface BackendRead {
	url: string
	method: string
	query: Record<string, unknown>
}

export type Backend = (read: BackendRead) => unknown

let backend: Backend = () => ({})
const reads: BackendRead[] = []

/** The query a request was given, as the renderer keys its response: none when it had none. */
const givenQueries = new WeakMap<BackendRead, Record<string, unknown> | undefined>()

const $authFetch = async (url: string, options: { method?: string; query?: Record<string, unknown> } = {}) => {
	const read = { url, method: (options.method ?? 'GET').toUpperCase(), query: options.query ?? {} }
	givenQueries.set(read, options.query)
	reads.push(read)
	return backend(read)
}

const noop = () => undefined

/** The auto-imports, which templates reach through the application's global properties. */
const autoImports: Record<string, unknown> = {}
function provideGlobal(name: string, value: unknown): void {
	autoImports[name] = value
	vi.stubGlobal(name, value)
}

// The application's auto-imports: Vue's API, the renderer's, the DMS layers'
// the module calls, and the module's own composables and utilities.
for (const [name, value] of Object.entries(vue)) if (/^[a-z]/.test(name)) vi.stubGlobal(name, value)
for (const name of ['useDmsFetch', 'useDmsAsyncData', 'useDmsState', 'useDmsRoute', 'useDmsRouter'] as const)
	provideGlobal(name, engine[name])
const { useApiData } = await import('#dms-core/app/composables/auth/useApiData')
provideGlobal('useApiData', useApiData)
provideGlobal('useAuthFetch', () => ({ $authFetch }))
provideGlobal('useI18n', () => ({
	t: (key: string, params?: Record<string, unknown>) => (params ? `${key} ${Object.values(params).join(' ')}` : key),
	te: () => false,
	locale: vue.ref('en'),
}))
provideGlobal('useRegionalFormat', () => ({ formatNumber: (value: number) => String(value) }))
provideGlobal('useToast', () => ({ add: noop }))
provideGlobal('useConfirm', () => ({ confirm: async () => false }))
provideGlobal('useOverlay', () => ({ create: () => ({ open: async () => undefined }) }))
provideGlobal('useApiError', noop)
provideGlobal('useUnsavedChanges', noop)
provideGlobal('usePageLiveRefresh', noop)
provideGlobal('defineShortcuts', noop)
provideGlobal('navigateDms', noop)
for (const util of [await import('#dms-core/app/utils/http-status'), await import('#dms-core/app/composables/useFieldErrors')])
	for (const [name, value] of Object.entries(util)) provideGlobal(name, value)
const own = import.meta.glob<Record<string, unknown>>(['../../app/composables/**/*.ts', '../../app/utils/**/*.ts'])
for (const load of Object.values(own))
	for (const [name, value] of Object.entries(await load())) provideGlobal(name, value)

// The DMS's and Nuxt UI's components the module's templates use: each renders
// its default slot, its props as attributes.
const UI_COMPONENTS = [
	'DmsCard',
	'DmsCopyButton',
	'DmsEmptyState',
	'DmsEyebrow',
	'DmsFieldRow',
	'DmsIconWell',
	'DmsSaveStatus',
	'DmsTextarea',
	'UBadge',
	'UButton',
	'UFormField',
	'UIcon',
	'UInput',
	'UKbd',
	'ULink',
	'USkeleton',
	'UTooltip',
]

const uiStub = (name: string): Component =>
	vue.defineComponent({
		name,
		inheritAttrs: false,
		setup:
			(_, { slots, attrs }) =>
			() =>
				h(
					'div',
					{
						'data-stub': name,
						...Object.fromEntries(
							Object.entries(attrs).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value)),
						),
					},
					slots.default?.(),
				),
	})

export interface ServerRender {
	html: string
	payload: DmsPayload
	/** Every backend request the render made, as `METHOD url?query`. */
	reads: string[]
	/**
	 * What the payload hands the browser, by key: a `useApiData(url)` read as
	 * `METHOD url?query`, a handler's read by its own key.
	 */
	handed: string[]
}

const describeRead = (method: string, url: string, query: Record<string, unknown> | null) => {
	const sent = Object.entries(query ?? {}).filter(([, value]) => value !== undefined)
	const search = new URLSearchParams(sent.map(([name, value]) => [name, String(value)])).toString()
	return `${method} ${url}${search ? `?${search}` : ''}`
}

// The renderer's request key: a digest of the method, the base URL, the URL,
// the query and the body (`requestKey` in `#dms/frontend-module`).
const HASH_SEEDS = [0xdeadbeef, 0x41c6ce57] as const
const HASH_MULTIPLIERS = [2654435761, 1597334677] as const
const HASH_FINALIZERS = [2246822507, 3266489909] as const
const HASH_SHIFTS = [16, 13] as const
const HASH_RADIX = 36
const HASH_LANE_LENGTH = 7

function stableJson(value: unknown): string {
	if (value === undefined || value === null) return 'null'
	if (typeof value !== 'object') return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
	const record = value as Record<string, unknown>
	const members = Object.keys(record)
		.filter((name) => record[name] !== undefined)
		.sort()
		.map((name) => `${JSON.stringify(name)}:${stableJson(record[name])}`)
	return `{${members.join(',')}}`
}

function hashText(text: string): string {
	let first: number = HASH_SEEDS[0]
	let second: number = HASH_SEEDS[1]
	for (let index = 0; index < text.length; index++) {
		const code = text.charCodeAt(index)
		first = Math.imul(first ^ code, HASH_MULTIPLIERS[0])
		second = Math.imul(second ^ code, HASH_MULTIPLIERS[1])
	}
	first = Math.imul(first ^ (first >>> HASH_SHIFTS[0]), HASH_FINALIZERS[0])
	first ^= Math.imul(second ^ (second >>> HASH_SHIFTS[1]), HASH_FINALIZERS[1])
	second = Math.imul(second ^ (second >>> HASH_SHIFTS[0]), HASH_FINALIZERS[0])
	second ^= Math.imul(first ^ (first >>> HASH_SHIFTS[1]), HASH_FINALIZERS[1])
	return [second, first].map((lane) => (lane >>> 0).toString(HASH_RADIX).padStart(HASH_LANE_LENGTH, '0')).join('')
}

/** The payload key a `useApiData(url)` read's response is handed over under. */
const fetchKey = (read: BackendRead) =>
	`$dmsfetch:${hashText(stableJson([read.method, '', read.url, givenQueries.get(read) ?? null, null]))}`

/** A payload key, as `describeRead` writes the request it answers for `$dmsfetch` keys. */
function handedKey(key: string, made: BackendRead[]): string {
	const read = made.find((candidate) => fetchKey(candidate) === key)
	return read ? describeRead(read.method, read.url, read.query) : key
}

/**
 * Renders `component` with `props` as a server renders the page `url`,
 * answering each backend request with `respond`.
 */
export async function serverRender(
	component: Component,
	props: Record<string, unknown> = {},
	options: { url?: string; respond?: Backend } = {},
): Promise<ServerRender> {
	backend = options.respond ?? (() => ({}))
	reads.length = 0
	const runtime = engine.createDmsFrontendRuntime(undefined, {}, true)
	runtime.route.fullPath = options.url ?? '/'
	const app = createSSRApp({ render: () => h(component, props) })
	engine.provideDmsFrontendRuntime(app, runtime)
	for (const name of UI_COMPONENTS) app.component(name, uiStub(name))
	Object.assign(app.config.globalProperties, autoImports)
	app.config.warnHandler = noop
	const html = await renderToString(app)
	const payload = engine.serializeDmsPayload(runtime)
	return {
		html,
		payload,
		reads: reads.map((read) => describeRead(read.method, read.url, read.query)),
		handed: Object.keys({ ...payload.data, ...payload.errors }).map((key) => handedKey(key, reads)),
	}
}
