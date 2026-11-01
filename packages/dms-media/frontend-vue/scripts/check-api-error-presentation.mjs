import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { checkApiErrorPresentation } from '@antelopejs/dms/checks/api-error-presentation'

const nonHttpNotices = new Map(
	[
		[
			'app/composables/useAssetLink.ts',
			"title: t('dms_media.asset_link.copy_failed'),",
		],
		[
			'app/composables/useAssetFieldUploads.ts',
			"title: t('dms_media.field_widget.upload.failed', { name: item.name }),",
		],
	].map(([file, title]) => [resolve(file), title]),
)

const diagnostics = checkApiErrorPresentation(['app']).filter((diagnostic) => {
	const [, file, line] =
		/^(.*):(\d+): Use useApiErrorPresenter/.exec(diagnostic) ?? []
	const title = nonHttpNotices.get(file)
	if (!title) return true
	const lines = readFileSync(file, 'utf8').split('\n')
	return lines[Number(line)]?.trim() !== title
})

if (diagnostics.length) throw new Error(diagnostics.join('\n'))
