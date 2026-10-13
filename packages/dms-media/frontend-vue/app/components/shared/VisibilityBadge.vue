<script setup lang="ts">
import type { FolderVisibility } from '../../types/media'

const props = withDefaults(
	defineProps<{ visibility: FolderVisibility; size?: 'sm' | 'md' }>(),
	{ size: 'md' },
)
const { t } = useI18n()
</script>

<template>
	<UBadge
		:label="t(`dms_media.visibility.${props.visibility}`)"
		:icon="VISIBILITY_ICONS[props.visibility]"
		:color="props.visibility === 'public' ? 'success' : 'neutral'"
		variant="subtle"
		:size="props.size"
	/>
</template>
