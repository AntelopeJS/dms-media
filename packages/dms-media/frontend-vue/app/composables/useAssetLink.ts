import type { MediaAsset } from '../types/media'

type LinkedAsset = Pick<MediaAsset, 'name' | 'url' | 'effectiveVisibility'>

export interface CopyAssetLinkOptions {
	/**
	 * Makes the file public once the member confirmed it. Given only when the
	 * caller may change the file's visibility: the warning of a private file
	 * then offers « Make public… ».
	 */
	makePublic?: () => Promise<unknown>
}

const TRAILING_SLASHES = /\/+$/
const LINKS_ORIGIN_API = '/api/media/links/origin'
const OBJECT_URL_LIFETIME_MS = 10_000
const MANUAL_COPY_TOAST_MS = 20_000

interface LinksOrigin {
	origin: string
}

type OriginFetch = () => Promise<LinksOrigin>

let linksOrigin: Promise<string> | undefined

/**
 * The origin every copied link starts with, as the API answers it: the one
 * serving `/media` to any browser, which the delivery tab of the file page
 * copies too. Read once per session.
 */
function resolveLinksOrigin(fetchOrigin: OriginFetch): Promise<string> {
	linksOrigin ??= fetchOrigin()
		.then(({ origin }) => origin.replace(TRAILING_SLASHES, ''))
		.catch((cause: unknown) => {
			linksOrigin = undefined
			throw cause
		})
	return linksOrigin
}

/**
 * Copying a file's stable link, warning when the link only opens for
 * signed-in members, and saving or opening the file itself.
 */
export function useAssetLink() {
	const api = useMediaApi()
	const { $authFetch } = useAuthFetch()
	const { t } = useI18n()
	const toast = useToast()
	const { confirm } = useConfirm()

	async function linkOf(asset: Pick<MediaAsset, 'url'>): Promise<string> {
		return `${await resolveLinksOrigin(() => $authFetch<LinksOrigin>(LINKS_ORIGIN_API))}${asset.url}`
	}

	/** Asks before a file becomes reachable by anyone holding its link. */
	function confirmMakePublic(asset: Pick<MediaAsset, 'name'>): Promise<boolean> {
		return confirm({
			title: t('dms_media.asset_link.make_public_title', { name: asset.name }),
			description: t('dms_media.asset_link.make_public_description'),
			color: 'warning',
			icon: 'i-ph-globe',
			confirmIcon: 'i-ph-globe',
			confirmLabel: t('dms_media.asset_link.make_public_confirm'),
			cancelLabel: t('dms_media.actions.cancel'),
			initialFocus: 'confirm',
		})
	}

	function warnPrivate(asset: LinkedAsset, options: CopyAssetLinkOptions): void {
		const makePublic = options.makePublic
		toast.add({
			title: t('dms_media.toasts.link_copied'),
			description: t('dms_media.asset_link.private_warning', { name: asset.name }),
			color: 'warning',
			icon: 'i-ph-lock-simple',
			actions: makePublic
				? [
						{
							label: t('dms_media.asset_link.make_public'),
							onClick: async () => {
								if (await confirmMakePublic(asset)) await makePublic()
							},
						},
					]
				: undefined,
		})
	}

	async function copyLink(asset: LinkedAsset, options: CopyAssetLinkOptions = {}): Promise<void> {
		const link = await linkOf(asset).catch(() => asset.url)
		try {
			await navigator.clipboard.writeText(link)
		} catch {
			toast.add({
				title: t('dms_media.asset_link.copy_failed'),
				description: link,
				color: 'error',
				icon: 'i-ph-warning',
				duration: MANUAL_COPY_TOAST_MS,
				ui: { description: 'select-all break-all font-mono' },
			})
			return
		}
		if (asset.effectiveVisibility === 'private') return warnPrivate(asset, options)
		toast.add({ title: t('dms_media.toasts.link_copied'), color: 'success', icon: 'i-ph-link' })
	}

	/**
	 * Saves the file under its name without leaving the page: the read URL is on
	 * the storage's origin, where the browser ignores a link's `download`, so the
	 * file is fetched and saved from memory.
	 */
	async function download(asset: Pick<MediaAsset, 'id' | 'name'>): Promise<boolean> {
		try {
			const { url } = await api.readUrl(asset.id)
			const response = await fetch(url)
			if (!response.ok) throw new Error(response.statusText)
			const objectUrl = URL.createObjectURL(await response.blob())
			downloadFile(objectUrl, asset.name)
			setTimeout(() => URL.revokeObjectURL(objectUrl), OBJECT_URL_LIFETIME_MS)
			return true
		} catch (cause) {
			useApiError(cause, { title: t('dms_media.toasts.download_failed') })
			return false
		}
	}

	/** Opens the file as the browser shows it, in a new tab. */
	async function openInNewTab(asset: Pick<MediaAsset, 'id'>): Promise<void> {
		const opened = window.open('', '_blank')
		try {
			const { url } = await api.readUrl(asset.id)
			if (!opened) return void window.open(url, '_blank', 'noopener')
			opened.opener = null
			opened.location.href = url
		} catch (cause) {
			opened?.close()
			useApiError(cause, { title: t('dms_media.asset_link.open_failed') })
		}
	}

	return { linkOf, copyLink, confirmMakePublic, download, openInNewTab }
}
