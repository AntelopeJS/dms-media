<script setup lang="ts">
import type { MediaAsset } from '../../types/media'
import AltTextField from '../shared/AltTextField.vue'

const props = defineProps<{
	asset: MediaAsset
	canEdit: boolean
	/** A chip on a dark thumbnail rather than in a text line. */
	overlay?: boolean
}>()
const emit = defineEmits<{ saved: [MediaAsset] }>()
const isOpen = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const api = useMediaApi()
const { presentError } = useApiErrorPresenter()

const hasAlt = computed(() => !needsAltText(props.asset))

async function save(alt: string): Promise<boolean> {
	try {
		await api.updateAsset(props.asset.id, { alt })
		emit('saved', { ...props.asset, alt })
		return true
	} catch (error) {
		presentError(error, { fallbackKey: 'dms_media.field_widget.alt.save_failed' })
		return false
	}
}
</script>

<template>
	<UPopover
		v-model:open="isOpen"
		:content="{ align: 'start', collisionPadding: 12 }"
	>
		<button
			type="button"
			class="inline-flex min-w-0 max-w-full shrink items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-medium"
			:class="[
				overlay ? 'bg-black/65 hover:bg-black/80' : 'hover:bg-(--dms-bg-muted)',
				hasAlt ? (overlay ? 'text-white' : 'text-muted') : 'text-warning',
			]"
			:aria-label="
				hasAlt
					? t('dms_media.field_widget.alt.edit', { name: asset.name })
					: t('dms_media.field_widget.alt.add', { name: asset.name })
			"
			@click.stop
		>
			<UIcon
				:name="hasAlt ? 'i-ph-check' : 'i-ph-warning'"
				class="size-3 shrink-0"
			/>
			<span v-if="!(overlay && hasAlt)" class="truncate">
				{{
					hasAlt
						? t('dms_media.field_widget.alt.set')
						: t('dms_media.field_widget.alt.missing')
				}}
			</span>
		</button>
		<template #content>
			<div class="w-[min(320px,calc(100vw-32px))] p-3">
				<AltTextField :asset="asset" :can-edit="canEdit" :save="save" compact />
			</div>
		</template>
	</UPopover>
</template>
