<script setup lang="ts">
import MediaDialog from '../shared/MediaDialog.vue'

const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()

const groups = computed(() =>
	EXPLORER_SHORTCUT_GROUPS.map((group) => ({
		label: t(`dms_media.shortcuts.groups.${group.id}`),
		shortcuts: group.shortcuts.map((shortcut) => ({
			keys: shortcut.keys,
			label: t(`dms_media.shortcuts.${shortcut.id}`),
		})),
	})),
)
</script>

<template>
	<MediaDialog
		:title="t('dms_media.shortcuts.title')"
		:description="t('dms_media.shortcuts.description')"
		icon="i-ph-keyboard"
		size="lg"
		@dismiss="emit('close')"
	>
		<div class="grid gap-x-8 gap-y-5 sm:grid-cols-2">
			<section v-for="group in groups" :key="group.label">
				<DmsEyebrow :label="group.label" tone="muted" class="mb-2" />
				<ul class="flex flex-col gap-1.5">
					<li
						v-for="shortcut in group.shortcuts"
						:key="shortcut.label"
						class="flex items-center justify-between gap-3 text-sm"
					>
						<span class="text-default">{{ shortcut.label }}</span>
						<span class="flex gap-1">
							<UKbd v-for="key in shortcut.keys" :key="key" :value="key" size="sm" />
						</span>
					</li>
				</ul>
			</section>
		</div>
	</MediaDialog>
</template>
