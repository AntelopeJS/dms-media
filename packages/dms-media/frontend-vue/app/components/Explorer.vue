<script setup lang="ts">
import type { LibraryLocation } from '../composables/library/useLibraryListing'
import type { SmartView } from '../types/media'
import ExplorerShell from './explorer/ExplorerShell.vue'

const route = useDmsRoute()
const router = useDmsRouter()
const SMART_VIEWS: SmartView[] = ['recent', 'starred', 'missing-alt']

function readQuery(name: string): string | undefined {
	const value = route.query[name]
	return typeof value === 'string' && value ? value : undefined
}

function locationFromRoute(): LibraryLocation {
	const query = readQuery('q')
	if (query) return { kind: 'search', query, scopeId: readQuery('folder') }
	const view = readQuery('view') as SmartView | undefined
	if (view && SMART_VIEWS.includes(view)) return { kind: 'view', view }
	const folderId = readQuery('folder')
	return folderId ? { kind: 'folder', folderId } : { kind: 'root' }
}

function queryFor(location: LibraryLocation): Record<string, string> {
	if (location.kind === 'folder') return { folder: location.folderId }
	if (location.kind === 'view') return { view: location.view }
	if (location.kind === 'search')
		return location.scopeId ? { q: location.query, folder: location.scopeId } : { q: location.query }
	return {}
}

const initialLocation = locationFromRoute()

function syncRoute(location: LibraryLocation): void {
	void router.replace({ path: route.path, query: queryFor(location) })
}
</script>

<template>
	<ExplorerShell class="flex-1" :initial-location="initialLocation" @location="syncRoute" />
</template>
