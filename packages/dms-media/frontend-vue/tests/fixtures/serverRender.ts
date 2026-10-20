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
for (const name of ['useDmsFetch', 'useDmsAsyncData', 'useDmsPagedData', 'useDmsState', 'useDmsRoute', 'useDmsRouter'] as const)
	provideGlobal(name, engine[name])
const { useApiData, useApiPagedData } = await import('#dms-core/app/composables/auth/useApiData')
provideGlobal('useApiData', useApiData)
provideGlobal('useApiPagedData', useApiPagedData)
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
provideGlobal('useDrawer', () => ({ open: noop }))
provideGlobal('useApiError', noop)
provideGlobal('useUnsavedChanges', noop)
provideGlobal('usePageLiveRefresh', noop)
provideGlobal('defineShortcuts', noop)
const keyboard = await import('#dms-ui/app/composables/global/keyboardPlatform')
// The labels a server render prints before the browser names its platform.
provideGlobal('useKeyboardPlatform', () => ({
	keyLabel: (key: string) => keyboard.keyboardKeyLabel(key, keyboard.DEFAULT_KEYBOARD_PLATFORM),
	formatShortcut: (keys: readonly string[]) => keyboard.formatKeyboardShortcut(keys, keyboard.DEFAULT_KEYBOARD_PLATFORM),
}))
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
					// Every slot, named ones included: a field's trailing hint renders with it.
					Object.values(slots).flatMap((slot) => slot?.() ?? []),
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

/** The payload key a `useApiData(url)` read's response is handed over under. */
const fetchKey = (read: BackendRead) => engine.dmsRequestKey(read.url, { method: read.method, query: givenQueries.get(read) })

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

/** What `inBrowserApp` gives back: what `setup` returned, and the backend requests made so far. */
export interface BrowserApp<T> {
	result: T
	/** Every backend request made so far, as `METHOD url?query`. */
	reads: () => string[]
}

/**
 * Runs `setup` as a browser application runs a call outside any component, on
 * the renderer's real data layer, answering each backend request with
 * `respond`.
 */
export function inBrowserApp<T>(setup: () => T, respond: Backend = () => ({})): BrowserApp<T> {
	backend = respond
	reads.length = 0
	const runtime = engine.createDmsFrontendRuntime(undefined, {}, false)
	const app = vue.createApp({ render: () => null })
	engine.provideDmsFrontendRuntime(app, runtime)
	return {
		result: app.runWithContext(setup),
		reads: () => reads.map((read) => describeRead(read.method, read.url, read.query)),
	}
}
