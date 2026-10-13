<script setup lang="ts">
import type { MediaFolder } from '../../types/media'

defineProps<{ folder: MediaFolder; open?: boolean }>()
</script>

<template>
	<UIcon
		:name="
			folder.bound
				? 'i-ph-link-simple'
				: folder.shell
					? 'i-ph-folder-dashed'
					: open
						? 'i-ph-folder-open'
						: 'i-ph-folder-simple'
		"
		class="size-4 shrink-0"
		:class="folder.shell ? 'text-dimmed' : 'text-muted'"
	/>
</template>
