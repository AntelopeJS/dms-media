import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { build as viteBuild, type Plugin } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { backendBoundary } from '../build/backend-boundary'

/** A scratch repository: the backend package, another package, and the frontend module inside the backend package. */
let repository: string
let frontend: string

function write(file: string, text: string): void {
	mkdirSync(dirname(file), { recursive: true })
	writeFileSync(file, text)
}

beforeAll(() => {
	repository = realpathSync(
		mkdtempSync(join(tmpdir(), 'dms-media-boundary-')),
	)
	const backend = join(repository, 'packages/dms-media')
	frontend = join(backend, 'frontend-vue')
	write(
		join(backend, 'package.json'),
		JSON.stringify({ name: '@antelopejs/dms-media' }),
	)
	write(join(backend, 'src/backend.ts'), 'export const secret = 1\n')
	write(join(backend, 'src/nested/deep.ts'), 'export const deep = 6\n')
	write(join(backend, 'dist/built.js'), 'export const built = 2\n')
	write(join(backend, 'dist/src/nested.js'), 'export const nested = 4\n')
	write(join(backend, 'srcx/sibling.ts'), 'export const sibling = 5\n')
	write(
		join(repository, 'packages/other/package.json'),
		JSON.stringify({ name: 'other' }),
	)
	write(
		join(repository, 'packages/other/src/shared.ts'),
		'export const shared = 3\n',
	)
	mkdirSync(frontend, { recursive: true })
	symlinkSync(join(backend, 'src/backend.ts'), join(frontend, 'linked.ts'))
})

afterAll(() => {
	rmSync(repository, { recursive: true, force: true })
})

interface BuildOptions {
	extra?: Plugin[]
	alias?: Record<string, string>
	preserveSymlinks?: boolean
	external?: string[]
}

/** Builds a frontend entry made of `source` with the boundary plugin, and returns the bundled code. */
async function build(
	source: string,
	options: BuildOptions = {},
): Promise<string> {
	write(join(frontend, 'entry.ts'), source)
	const result = await viteBuild({
		root: frontend,
		configFile: false,
		logLevel: 'silent',
		plugins: [backendBoundary(), ...(options.extra ?? [])],
		resolve: {
			alias: options.alias ?? {},
			preserveSymlinks: options.preserveSymlinks ?? false,
		},
		build: {
			write: false,
			rollupOptions: { external: options.external ?? [] },
			lib: { entry: join(frontend, 'entry.ts'), formats: ['es'] },
		},
	})
	return JSON.stringify(result)
}

/** A plugin that answers the import `request` with the module id `id`. */
function resolver(request: string, id: string): Plugin {
	return {
		name: 'test-resolver',
		resolveId: (source) => (source === request ? { id } : null),
		load: (loaded) =>
			loaded === id || loaded.startsWith('\0') ? 'export default 1\n' : null,
	}
}

const backendFile = () =>
	join(repository, 'packages/dms-media/src/backend.ts')

describe('the backend boundary of the frontend build', () => {
	it('fails on an import of the backend source, naming both files', async () => {
		const failure = build(
			'import { secret } from "../src/backend.ts"\nexport { secret }\n',
		)
		await expect(failure).rejects.toThrow(/Backend boundary/)
		await expect(failure).rejects.toThrow(join(frontend, 'entry.ts'))
		await expect(failure).rejects.toThrow(backendFile())
	})

	it('fails on a file deeper under the backend source', async () => {
		await expect(
			build('import { deep } from "../src/nested/deep.ts"\nexport { deep }\n'),
		).rejects.toThrow(/Backend boundary/)
	})

	it('fails on an alias that points into the backend source', async () => {
		await expect(
			build(
				'import { secret } from "@backend/backend.ts"\nexport { secret }\n',
				{
					alias: { '@backend': join(repository, 'packages/dms-media/src') },
				},
			),
		).rejects.toThrow(/Backend boundary/)
	})

	it('fails on a symlink to the backend source that the resolver returns', async () => {
		await expect(
			build('import { secret } from "./linked.ts"\nexport { secret }\n', {
				extra: [resolver('./linked.ts', join(frontend, 'linked.ts'))],
				preserveSymlinks: true,
			}),
		).rejects.toThrow(/Backend boundary/)
	})

	it('fails on an id that names the backend source with a query or a hash', async () => {
		for (const suffix of ['?raw', '#fragment']) {
			await expect(
				build('import secret from "virtual-backend"\nexport { secret }\n', {
					extra: [resolver('virtual-backend', `${backendFile()}${suffix}`)],
				}),
			).rejects.toThrow(/Backend boundary/)
		}
	})

	it('fails on a backend source import declared external', async () => {
		await expect(
			build('import { secret } from "../src/backend.ts"\nexport { secret }\n', {
				external: [backendFile()],
			}),
		).rejects.toThrow(/Backend boundary/)
	})

	it('fails on a worker entry under the backend source', async () => {
		await expect(
			build(
				'export const worker = new Worker(new URL("../src/backend.ts", import.meta.url), { type: "module" })\n',
			),
		).rejects.toThrow(/Backend boundary/)
	})

	it('fails on a worker of the frontend that imports the backend source', async () => {
		write(
			join(frontend, 'worker.ts'),
			'import { secret } from "../src/backend.ts"\npostMessage(secret)\n',
		)
		await expect(
			build(
				'export const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })\n',
			),
		).rejects.toThrow(/Backend boundary/)
	})

	it('passes the built output, a virtual module and the source of another package', async () => {
		expect(
			await build(
				'import { built } from "../dist/built.js"\nexport { built }\n',
			),
		).toMatch(/built/)
		expect(
			await build('import value from "virtual:thing"\nexport { value }\n', {
				extra: [resolver('virtual:thing', '\0virtual:thing')],
			}),
		).toMatch(/value/)
		expect(
			await build(
				'import { shared } from "../../other/src/shared.ts"\nexport { shared }\n',
			),
		).toMatch(/shared/)
	})

	it('passes a sibling folder named like src and a src folder inside dist', async () => {
		expect(
			await build(
				'import { sibling } from "../srcx/sibling.ts"\nexport { sibling }\n',
			),
		).toMatch(/sibling/)
		expect(
			await build(
				'import { nested } from "../dist/src/nested.js"\nexport { nested }\n',
			),
		).toMatch(/nested/)
	})
})
