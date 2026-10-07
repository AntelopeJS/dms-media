<script setup lang="ts">
defineProps<{ code: string; label?: string }>()
const { t } = useI18n()
</script>

<template>
	<div class="border-default overflow-hidden rounded-md border bg-(--dms-bg-muted)">
		<div class="border-default flex items-center justify-between border-b px-3 py-1.5">
			<DmsEyebrow :label="label ?? t('dms_media.code.label')" tone="muted" />
			<DmsCopyButton :value="code" />
		</div>
		<pre class="text-default overflow-x-auto p-3 font-mono text-[12px] leading-relaxed"><code>{{ code }}</code></pre>
	</div>
</template>
