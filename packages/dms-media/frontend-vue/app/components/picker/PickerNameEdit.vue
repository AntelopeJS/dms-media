<script setup lang="ts">
interface Props {
	name: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
	commit: [name: string];
	cancel: [];
}>();

const draft = ref(props.name);
const inputRef = useTemplateRef<HTMLInputElement>("input");
const isDone = ref(false);

onMounted(() => {
	const element = inputRef.value;
	if (!element) return;
	element.focus();
	const dotIndex = props.name.lastIndexOf(".");
	element.setSelectionRange(0, dotIndex > 0 ? dotIndex : props.name.length);
});

function commit(): void {
	if (isDone.value) return;
	isDone.value = true;
	emit("commit", draft.value.trim() || props.name);
}

function cancelEdit(): void {
	if (isDone.value) return;
	isDone.value = true;
	emit("cancel");
}
</script>

<template>
	<input
		ref="input"
		v-model="draft"
		class="w-full rounded-md border border-primary bg-default px-1.5 py-0.5 text-xs text-highlighted ring-2 ring-primary/20 outline-none"
		@click.stop
		@dblclick.stop
		@contextmenu.stop
		@keydown.enter.stop.prevent="commit"
		@keydown.esc.stop.prevent="cancelEdit"
		@blur="commit"
	/>
</template>
