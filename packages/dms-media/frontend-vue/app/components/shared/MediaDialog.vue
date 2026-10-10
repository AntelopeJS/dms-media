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
		:title="title"
		:description="description"
		:dismissible="dismissible"
		:close="dismissible ? { onClick: () => emit('dismiss') } : false"
		:ui="{ content: widthClass, footer: 'justify-end gap-2' }"
		@update:open="onOpenChange"
	>
		<template #title>
			<span class="flex items-center gap-3">
				<DmsIconWell v-if="icon" :icon="icon" :tone="tone" />
				<span class="text-highlighted text-[17px] leading-tight font-semibold tracking-tight">{{ title }}</span>
			</span>
		</template>
		<template v-if="description" #description>
			<span :class="icon && 'ps-12'">{{ description }}</span>
		</template>
		<template #body>
			<slot />
		</template>
		<template v-if="$slots.footer" #footer>
			<slot name="footer" />
		</template>
	</UModal>
</template>
