<script setup lang="ts">
import FileViewer from './file/FileViewer.vue'

const file = useCurrentFile()
</script>

<template>
	<FileViewer v-if="file.asset.value" :asset="file.asset.value" :siblings="file.siblings.value" @open="file.open" @fullscreen="file.fullscreen" />
	<USkeleton v-else-if="!file.error.value" class="h-[520px] w-full rounded-lg" />
</template>
