<script setup lang="ts">
import type { ExplorerContext } from '../../composables/library/useExplorerCommands'
import ExplorerInspector from './ExplorerInspector.vue'

// The DMS drawer renders at the app's root, away from the explorer that opens
// it: its context comes as a prop and is provided again for the inspector.
const props = defineProps<{ context: ExplorerContext }>()
shareExplorerContext(props.context)
</script>

<template>
	<ExplorerInspector class="min-w-0 flex-1" />
</template>
