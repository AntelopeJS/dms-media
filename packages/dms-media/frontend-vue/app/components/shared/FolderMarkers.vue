<script setup lang="ts">
import type { MediaFolder } from '../../types/media'

defineProps<{ folder: MediaFolder }>()
const { t } = useI18n()
</script>

<template>
	<span class="inline-flex shrink-0 items-center gap-1">
		<UTooltip v-if="folder.visibility === 'public'" :text="t('dms_media.markers.public')">
			<UIcon name="i-ph-globe" class="text-success size-3.5" />
		</UTooltip>
		<UTooltip v-if="folder.hasOwnAcl && !folder.bound" :text="t('dms_media.markers.own_rules')">
			<UIcon name="i-ph-lock-simple" class="text-warning size-3.5" />
		</UTooltip>
		<UTooltip v-if="folder.bound" :text="t('dms_media.markers.linked')">
			<UIcon name="i-ph-link-simple" class="text-primary size-3.5" />
		</UTooltip>
		<UTooltip v-if="folder.shell" :text="t('dms_media.markers.traverse_only')">
			<UIcon name="i-ph-eye-slash" class="text-dimmed size-3.5" />
		</UTooltip>
	</span>
</template>
