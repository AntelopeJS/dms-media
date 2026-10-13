<script setup lang="ts">
import { useMutationObserver } from '@vueuse/core'

const props = withDefaults(
	defineProps<{
		title: string
		description?: string
		icon?: string
		tone?: 'primary' | 'error' | 'warning' | 'success' | 'neutral' | 'info'
		size?: 'sm' | 'md' | 'lg'
		dismissible?: boolean
		/** Selectors of the element focused on open, by priority; the close button otherwise. */
		initialFocus?: string[]
		/** Bound by the overlay that opens the dialog. */
		open?: boolean
	}>(),
	{ tone: 'primary', size: 'md', dismissible: true, initialFocus: () => ['[data-initial-focus]'], open: true },
)
const emit = defineEmits<{ dismiss: []; 'update:open': [boolean] }>()

const widthClass = computed(
	() => ({ sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-3xl' })[props.size],
)

const FOCUSABLE = 'input, textarea, select, button, [tabindex]'

function onOpenChange(open: boolean): void {
	emit('update:open', open)
	if (!open) emit('dismiss')
}

function findInitialFocus(content: HTMLElement): HTMLElement | undefined {
	for (const selector of props.initialFocus) {
		const match = content.querySelector<HTMLElement>(selector)
		const target = match?.matches(FOCUSABLE) ? match : match?.querySelector<HTMLElement>(FOCUSABLE)
		if (target) return target
	}
	return undefined
}

let stopWatchingBody: (() => void) | undefined

function focusTarget(content: HTMLElement): boolean {
	const target = findInitialFocus(content)
	target?.focus()
	return Boolean(target)
}

/** The body's DMS components mount after the dialog opens: its target takes the focus as soon as it is in the page. */
function focusInitial(event: Event): void {
	event.preventDefault()
	const content = event.target as HTMLElement
	if (focusTarget(content)) return
	content.querySelector<HTMLElement>(FOCUSABLE)?.focus()
	const { stop } = useMutationObserver(content, () => focusTarget(content) && stop(), { childList: true, subtree: true })
	stopWatchingBody = stop
}

onBeforeUnmount(() => stopWatchingBody?.())
</script>

<template>
	<UModal
		:open="open"
		:title="title"
		:description="description"
		:dismissible="dismissible"
		:close="dismissible ? { onClick: () => emit('dismiss') } : false"
		:ui="{ content: widthClass, footer: 'justify-end gap-2' }"
		:content="{ onOpenAutoFocus: focusInitial }"
		@update:open="onOpenChange"
	>
		<template #title>
			<span class="flex items-center gap-3">
				<DmsIconWell v-if="icon" :icon="icon" :tone="tone" />
				<span class="text-highlighted text-[17px] leading-tight font-semibold tracking-tight">{{ title }}</span>
			</span>
		</template>
		<template v-if="description" #description>
			<span class="block" :class="icon && 'ps-12'">{{ description }}</span>
		</template>
		<template #body>
			<slot />
		</template>
		<template v-if="$slots.footer" #footer>
			<slot name="footer" />
		</template>
	</UModal>
</template>
