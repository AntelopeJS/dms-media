<script setup lang="ts">
import type { PresetsResponse } from '../types/media'
import CodeBlock from './shared/CodeBlock.vue'

const api = useMediaApi()
const { t } = useI18n()
const data = ref<PresetsResponse | null>(null)

onMounted(async () => {
	data.value = await api.presets().catch(() => null)
})

const snippet = computed(() => {
	const presets = (data.value?.presets ?? []).map(({ id, width, height, fit, format, quality }) =>
		JSON.stringify(Object.fromEntries(Object.entries({ id, width, height, fit, format, quality }).filter(([, value]) => value !== undefined))),
	)
	return ['"dms-media": {', '  "config": {', '    "presets": [', ...presets.map((line, index) => `      ${line}${index < presets.length - 1 ? ',' : ''}`), '    ]', '  }', '}'].join('\n')
})
</script>

<template>
	<DmsCard :title="t('dms_media.presets.config.title')">
		<div class="flex flex-col gap-3">
			<CodeBlock v-if="data" :code="snippet" label="antelope.config.ts" />
			<USkeleton v-else class="h-40 w-full" />
			<p class="text-muted text-[13px]">{{ t('dms_media.presets.config.hint') }}</p>
		</div>
	</DmsCard>
</template>
