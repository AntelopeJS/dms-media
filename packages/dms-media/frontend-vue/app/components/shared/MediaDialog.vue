<script setup lang="ts">
const props = withDefaults(
	defineProps<{
		title: string
		description?: string
		icon?: string
		tone?: 'primary' | 'error' | 'warning' | 'success' | 'neutral' | 'info'
		size?: 'sm' | 'md' | 'lg'
		dismissible?: boolean
	}>(),
	{ tone: 'primary', size: 'md', dismissible: true },
)
const emit = defineEmits<{ dismiss: [] }>()
const { t } = useI18n()
const isOpen = ref(true)

const widthClass = computed(
	() => ({ sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-3xl' })[props.size],
)

function onOpenChange(open: boolean): void {
	if (!open) emit('dismiss')
}
</script>

<template>
	<UModal
		v-model:open="isOpen"
		:dismissible="dismissible"
		:ui="{ content: widthClass, footer: 'justify-end gap-2' }"
		@update:open="onOpenChange"
	>
		<template #header>
			<DmsIconWell v-if="icon" :icon="icon" :tone="tone" />
			<div class="min-w-0 flex-1">
				<h2 class="text-highlighted text-[17px] leading-tight font-semibold tracking-tight">
					{{ title }}
				</h2>
				<p v-if="description" class="text-muted mt-1 text-[13px]">
					{{ description }}
				</p>
			</div>
			<UButton
				v-if="dismissible"
				icon="i-ph-x"
				color="neutral"
				variant="ghost"
				size="sm"
				square
				:aria-label="t('dms_media.actions.close')"
				@click="emit('dismiss')"
			/>
		</template>
		<template #body>
			<slot />
		</template>
		<template v-if="$slots.footer" #footer>
			<slot name="footer" />
		</template>
	</UModal>
</template>
