<script setup lang="ts">
import AccessFolderTree from './access/AccessFolderTree.vue'

const editor = useAccessEditor()
</script>

<template>
	<AccessFolderTree :folders="editor.tree.value?.folders ?? []" :selected-id="editor.selectedId.value" @select="editor.select" />
</template>
