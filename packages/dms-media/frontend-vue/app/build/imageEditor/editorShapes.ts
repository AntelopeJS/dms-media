import type { MediaAsset } from '../../types/media'
import type { PixelSize } from '../../utils/editorAspects'

export interface CropCoordinates {
	left: number
	top: number
	width: number
	height: number
}

export interface CropperImage {
	src: string
	width: number
	height: number
	transforms: { rotate: number; flip: { horizontal: boolean; vertical: boolean } }
}

export interface CropperChange {
	coordinates: CropCoordinates
	image: CropperImage
}

export interface ImageSize {
	imageSize: PixelSize
}

export interface RotateOptions {
	transitions?: boolean
}

export interface CropperHandle {
	rotate: (angle: number, options?: RotateOptions) => void
	zoom: (factor: number) => void
	reset: () => void
	refresh: () => void
	setCoordinates: (coordinates: Partial<CropCoordinates> | ((size: ImageSize) => Partial<CropCoordinates>)) => void
}

export interface PendingChange {
	icon: string
	label: string
	detail: string
}

export interface CropField {
	key: keyof CropCoordinates
	label: string
}

export interface KeyStep {
	x: number
	y: number
}

export interface PresetPreview {
	id: string
	label: string
	width: number
	height: number
	coordinates: CropCoordinates
}

export type LoadState = 'loading' | 'ready' | 'error' | 'missing'

export const FULL_TURN = 360
export const QUARTER_TURN = 90
export const ZOOM_STEP = 1.2
export const PRESET_PREVIEW_SIZE = 128
export const EDITING_PRESET = 'preview'
export const EDITING_MAX_SIDE = 2048
export const SAME_SHAPE_TOLERANCE = 0.02
export const NUDGE_RATIO = 0.01
export const VECTOR_MIMETYPE = 'image/svg+xml'
export const KEY_STEPS: Record<string, KeyStep> = {
	ArrowLeft: { x: -1, y: 0 },
	ArrowRight: { x: 1, y: 0 },
	ArrowUp: { x: 0, y: -1 },
	ArrowDown: { x: 0, y: 1 },
}

export function centeredRegion(coordinates: CropCoordinates, ratio: number): CropCoordinates {
	const width = Math.min(coordinates.width, coordinates.height * ratio)
	const height = width / ratio
	return { left: coordinates.left + (coordinates.width - width) / 2, top: coordinates.top + (coordinates.height - height) / 2, width, height }
}

export function naturalSize(url: string): Promise<PixelSize> {
	return new Promise((resolve, reject) => {
		const image = new Image()
		image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
		image.onerror = reject
		image.src = url
	})
}

export function hasSameShape(size: PixelSize, target: MediaAsset): boolean {
	if (!target.width || !target.height) return false
	const ratio = size.width / size.height
	const targetRatio = target.width / target.height
	return [targetRatio, 1 / targetRatio].some((candidate) => Math.abs(ratio - candidate) / candidate < SAME_SHAPE_TOLERANCE)
}

export function fullImage({ imageSize: size }: ImageSize): CropCoordinates {
	return { left: 0, top: 0, width: size.width, height: size.height }
}

/** A large image is edited on its preview size: the crop is relative, the server applies it to the full file. */
export async function editingSource(api: ReturnType<typeof useMediaApi>, target: MediaAsset): Promise<string> {
	const isLarge = Math.max(target.width ?? 0, target.height ?? 0) > EDITING_MAX_SIDE
	if (isLarge) {
		const preview = await api
			.readUrl(target.id, EDITING_PRESET)
			.then(async ({ url }) => ((hasSameShape(await naturalSize(url), target)) ? url : undefined))
			.catch(() => undefined)
		if (preview) return preview
	}
	return (await api.readUrl(target.id)).url
}
