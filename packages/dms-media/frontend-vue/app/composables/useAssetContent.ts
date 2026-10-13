import type { MediaAsset } from '../types/media'

export type AssetContentKind = 'image' | 'video' | 'frame' | 'text' | 'none'

export interface AssetContent {
	kind: AssetContentKind
	/** Read URL the image, video or frame loads. */
	url?: string
	/** First lines of a text file. */
	text?: string
	/** The text was cut to its first lines. */
	isTruncated?: boolean
}

const TEXT_PREVIEW_BYTES = 64_000
const IMAGE_PRESET = 'preview'
/**
 * The browser's PDF viewer titles its toolbar with the read URL's storage
 * key: the preview hides it; « Open in a new tab » gives the full viewer.
 */
const FRAME_FRAGMENT = '#toolbar=0&navpanes=0'

type ShownAsset = Pick<MediaAsset, 'id' | 'mimetype' | 'typeGroup'>

function contentKindOf(asset: ShownAsset): AssetContentKind {
	if (isImageAsset(asset)) return 'image'
	if (asset.typeGroup === 'video') return 'video'
	if (isFramedAsset(asset)) return 'frame'
	return isTextAsset(asset) ? 'text' : 'none'
}

async function readText(url: string): Promise<Pick<AssetContent, 'text' | 'isTruncated'>> {
	const response = await fetch(url)
	if (!response.ok) throw new Error(response.statusText)
	const bytes = new Uint8Array(await response.arrayBuffer())
	const isTruncated = bytes.length > TEXT_PREVIEW_BYTES
	return { text: new TextDecoder().decode(bytes.subarray(0, TEXT_PREVIEW_BYTES)), isTruncated }
}

/**
 * What the file viewers show of a file: an image at its preview size, a video,
 * a PDF in a frame, the first lines of a text or CSV file, or nothing.
 */
export function useAssetContent() {
	const api = useMediaApi()

	async function load(asset: ShownAsset): Promise<AssetContent> {
		const kind = contentKindOf(asset)
		if (kind === 'none') return { kind }
		try {
			const preset = asset.typeGroup === 'image' ? IMAGE_PRESET : undefined
			const { url } = await api.readUrl(asset.id, preset)
			if (kind === 'text') return { kind, ...(await readText(url)) }
			return { kind, url: kind === 'frame' ? `${url}${FRAME_FRAGMENT}` : url }
		} catch {
			return { kind: 'none' }
		}
	}

	return { load }
}
