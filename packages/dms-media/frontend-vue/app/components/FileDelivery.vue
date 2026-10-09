<script setup lang="ts">
const { t } = useI18n()
const config = useDmsRuntimeConfig()
const file = useCurrentFile()
const asset = computed(() => file.asset.value)
const details = computed(() => file.details.value)
const apiOrigin = computed(() => config.public.dms.baseURL ?? '')
</script>

<template>
	<div v-if="asset && details" class="flex flex-col gap-4">
		<p class="text-muted text-[13px]">{{ asset.effectiveVisibility === 'public' ? t('dms_media.file.delivery_public') : t('dms_media.file.delivery_private') }}</p>
		<div class="flex flex-col gap-1.5">
			<span class="text-highlighted text-sm font-medium">{{ t('dms_media.file.stable_link') }}</span>
			<div class="flex gap-2">
				<code class="border-default min-w-0 flex-1 truncate rounded-md border bg-(--dms-bg-muted) px-2.5 py-1.5 font-mono text-[12px]">{{ asset.url }}</code>
				<DmsCopyButton :value="`${apiOrigin}${asset.url}`" />
			</div>
		</div>
		<div v-for="preset in details.presets" :key="preset.id" class="flex flex-col gap-1.5">
			<span class="text-highlighted flex items-center gap-2 text-sm font-medium">
				{{ preset.id }}
				<span class="text-dimmed font-mono text-[11px]">{{ preset.width ?? '–' }} × {{ preset.height ?? '–' }}</span>
			</span>
			<div class="flex gap-2">
				<code class="border-default min-w-0 flex-1 truncate rounded-md border bg-(--dms-bg-muted) px-2.5 py-1.5 font-mono text-[12px]">{{ preset.url }}</code>
				<DmsCopyButton :value="`${apiOrigin}${preset.url}`" />
			</div>
		</div>
		<UButton variant="link" size="sm" class="self-start" icon="i-ph-frame-corners" :label="t('dms_media.file.see_presets')" :to="MEDIA_ROUTES.presets" />
	</div>
	<USkeleton v-else class="h-40" />
</template>
