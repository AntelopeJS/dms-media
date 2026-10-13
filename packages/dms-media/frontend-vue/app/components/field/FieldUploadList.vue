<script setup lang="ts">
import type { UploadItem } from '../../composables/useUploadQueue'

const props = defineProps<{
	items: readonly UploadItem[]
	failureText: (item: UploadItem) => string
	isFailed: (item: UploadItem) => boolean
}>()
const emit = defineEmits<{
	retry: [string]
	cancel: [string]
	dismiss: [string]
}>()
const { t } = useI18n()
const format = useMediaFormat()

const PERCENT = 100

function progressOf(item: UploadItem): number {
	return item.size > 0 ? Math.round((item.loaded / item.size) * PERCENT) : 0
}

function statusText(item: UploadItem): string {
	if (props.isFailed(item)) return props.failureText(item)
	if (item.status === 'waiting')
		return t('dms_media.field_widget.upload.waiting')
	if (item.status === 'checking')
		return t('dms_media.field_widget.upload.checking')
	return t('dms_media.field_widget.upload.progress', {
		percent: progressOf(item),
		size: format.formatBytes(item.size),
	})
}
</script>

<template>
	<ul class="flex flex-col gap-1.5" aria-live="polite">
		<li
			v-for="item in items"
			:key="item.id"
			class="flex items-center gap-2.5 rounded-md border px-2.5 py-2"
			:class="
				isFailed(item)
					? 'border-(--ui-error)/40 bg-(--ui-error)/5'
					: 'border-default'
			"
		>
			<UIcon
				:name="isFailed(item) ? 'i-ph-warning-circle' : 'i-ph-cloud-arrow-up'"
				class="size-5 shrink-0"
				:class="isFailed(item) ? 'text-error' : 'text-muted'"
			/>
			<div class="min-w-0 flex-1">
				<p class="text-highlighted truncate text-[13px] font-medium">
					{{ item.name }}
				</p>
				<p
					class="text-[12px]"
					:class="isFailed(item) ? 'text-error' : 'text-muted'"
				>
					{{ statusText(item) }}
				</p>
				<UProgress
					v-if="!isFailed(item)"
					:model-value="item.status === 'waiting' ? null : progressOf(item)"
					size="xs"
					class="mt-1"
				/>
			</div>
			<UButton
				v-if="item.status === 'failed'"
				icon="i-ph-arrow-clockwise"
				color="neutral"
				variant="ghost"
				size="xs"
				:label="t('dms_media.field_widget.upload.retry')"
				@click="emit('retry', item.id)"
			/>
			<UButton
				icon="i-ph-x"
				color="neutral"
				variant="ghost"
				size="xs"
				square
				:aria-label="
					isFailed(item)
						? t('dms_media.field_widget.upload.dismiss', { name: item.name })
						: t('dms_media.field_widget.upload.cancel', { name: item.name })
				"
				@click="
					isFailed(item) ? emit('dismiss', item.id) : emit('cancel', item.id)
				"
			/>
		</li>
	</ul>
</template>
