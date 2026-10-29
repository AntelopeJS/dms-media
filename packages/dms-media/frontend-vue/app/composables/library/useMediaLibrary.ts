import type { InjectionKey } from 'vue'
import { createLibraryActions } from '../../build/library/libraryActions'
import { createMediaLibrary, type LibraryCore } from '../../build/library/libraryCore'
import type { LibraryLocation, ListingFilters } from './useLibraryListing'

const LIBRARY_KEY: InjectionKey<MediaLibrary> = Symbol('dms-media-library')

export interface MediaLibraryOptions {
	/** Picker mode never navigates the dashboard and hides management actions. */
	mode: 'browse' | 'pick'
	/** Mimetype patterns a picker accepts (`image/*`); every file when empty. */
	accept?: string[]
	/** Most files a picker may still add. */
	remaining?: number
	/** The folder a picker is kept inside, when its field is bound to one. */
	scopeFolderId?: string
	/** Files the picker's field already holds: shown, but not picked twice. */
	alreadyPicked?: string[]
	/** Where the explorer starts, read with the page by a server render. */
	initialLocation?: LibraryLocation
	/** The filters it starts with. */
	initialFilters?: Partial<ListingFilters>
}

/** What a name dialog learns from a write: whether it is done, or the refusal to show under the field. */
export interface NameOutcome {
	isDone: boolean
	id?: string
	fieldError?: string
}

export type MediaLibrary = LibraryCore & {
	actions: ReturnType<typeof createLibraryActions>
}

export function provideMediaLibrary(options: MediaLibraryOptions): MediaLibrary {
	const core = createMediaLibrary(options)
	const library: MediaLibrary = { ...core, actions: createLibraryActions(core) }
	provide(LIBRARY_KEY, library)
	return library
}

export function useMediaLibrary(): MediaLibrary {
	const library = inject(LIBRARY_KEY)
	if (!library) throw new Error('useMediaLibrary() needs a media explorer above it')
	return library
}
