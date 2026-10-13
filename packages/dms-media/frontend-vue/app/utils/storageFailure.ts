/** Why a file PUT to storage met a network error instead of an answer. */
export type StorageNetworkFailure = 'connection' | 'storage_blocked' | 'storage_unreachable'

export interface StorageNetworkSignals {
	/** The browser still believes it is online. */
	isOnline: boolean
	/** Part of the file already left: the link dropped mid-send. */
	hasSentBytes: boolean
	/** The storage server answers a plain request from this browser. */
	isStorageReachable: boolean
}

export interface StorageFailureDiagnosis {
	failure: StorageNetworkFailure
	/** The address to name in the message: this site when refused, the storage when out of reach. */
	address: string
}

/**
 * The presign call to the same API has just succeeded, so a PUT that fails
 * before sending anything while the browser is online is a refusal: the API
 * does not allow this site's origin (CORS), or its storage address cannot be
 * reached from the browser. Retrying would fail the same way.
 */
export function classifyStorageNetworkFailure(signals: StorageNetworkSignals): StorageNetworkFailure {
	if (!signals.isOnline || signals.hasSentBytes) return 'connection'
	return signals.isStorageReachable ? 'storage_blocked' : 'storage_unreachable'
}

function originOf(url: string): string {
	try {
		return new URL(url, globalThis.location?.href).origin
	} catch {
		return url
	}
}

/** An opaque request any server answers, whatever its CORS settings: it only fails when out of reach. */
async function isReachable(origin: string): Promise<boolean> {
	try {
		await fetch(origin, { method: 'HEAD', mode: 'no-cors', cache: 'no-store', credentials: 'omit' })
		return true
	} catch {
		return false
	}
}

/** Looks into a network error of a storage PUT, probing the storage only when it can tell something. */
export async function diagnoseStorageFailure(uploadUrl: string, hasSentBytes: boolean): Promise<StorageFailureDiagnosis> {
	const isOnline = globalThis.navigator?.onLine ?? true
	const storageOrigin = originOf(uploadUrl)
	const shouldProbe = isOnline && !hasSentBytes
	const isStorageReachable = shouldProbe ? await isReachable(storageOrigin) : true
	const failure = classifyStorageNetworkFailure({ isOnline, hasSentBytes, isStorageReachable })
	const siteOrigin = globalThis.location?.origin ?? ''
	return { failure, address: failure === 'storage_unreachable' ? storageOrigin : siteOrigin }
}
