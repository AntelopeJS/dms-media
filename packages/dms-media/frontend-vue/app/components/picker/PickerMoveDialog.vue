<script setup lang="ts">
import type { TreeItem } from "@nuxt/ui";
import type { MockItemPublic } from "../../utils/finder/models";
import {
	PICKER_DISMISS_GRACE_MS,
	PICKER_ROOT_TREE_VALUE,
	usePickerExplorer,
} from "../../composables/picker/usePickerExplorer";

interface Props {
	item: MockItemPublic;
}

const props = defineProps<Props>();

const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const { treeItems, canMoveItemTo, moveItemTo } = usePickerExplorer();

const selectedFolderId = ref<string | null | undefined>(undefined);
const isMoving = ref(false);

const mountedAt = Date.now();

function markDisabled(items: TreeItem[]): TreeItem[] {
	return items.map((item) => {
		const folderId =
			item.value === PICKER_ROOT_TREE_VALUE ? null : String(item.value);
		return {
			...item,
			disabled: !canMoveItemTo(props.item, folderId),
			children: item.children ? markDisabled(item.children) : undefined,
		};
	});
}

const targetTree = computed(() => markDisabled(treeItems.value));

const expandedKeys = ref<string[]>([
	PICKER_ROOT_TREE_VALUE,
	...props.item.ancestors,
]);

function handleTreeSelect(item: TreeItem | TreeItem[] | undefined): void {
	if (!item || Array.isArray(item)) {
		selectedFolderId.value = undefined;
		return;
	}
	selectedFolderId.value =
		item.value === PICKER_ROOT_TREE_VALUE ? null : String(item.value);
}

const canConfirm = computed(
	() =>
		selectedFolderId.value !== undefined &&
		canMoveItemTo(props.item, selectedFolderId.value),
);

async function confirmMove(): Promise<void> {
	if (!canConfirm.value || isMoving.value) return;
	isMoving.value = true;
	try {
		await moveItemTo(props.item, selectedFolderId.value as string | null);
		emit("close");
	} finally {
		isMoving.value = false;
	}
}

function handleOpenChange(open: boolean): void {
	if (open) return;
	if (Date.now() - mountedAt < PICKER_DISMISS_GRACE_MS) return;
	emit("close");
}
</script>

<template>
	<UModal
		:open="true"
		:title="t('dms_media.picker.move_title', { name: props.item.name })"
		:close="{ onClick: () => emit('close') }"
		@update:open="handleOpenChange"
	>
		<template #body>
			<div class="max-h-80 overflow-y-auto">
				<UTree
					v-model:expanded="expandedKeys"
					:items="targetTree"
					:get-key="(item: TreeItem) => String(item.value)"
					color="primary"
					size="sm"
					@update:model-value="handleTreeSelect"
				/>
			</div>
		</template>
		<template #footer>
			<div class="flex w-full justify-end gap-2">
				<UButton
					variant="ghost"
					color="neutral"
					:label="t('dms_media.picker.cancel')"
					@click="emit('close')"
				/>
				<UButton
					color="primary"
					:disabled="!canConfirm"
					:loading="isMoving"
					:label="t('dms_media.picker.move_confirm')"
					@click="confirmMove"
				/>
			</div>
		</template>
	</UModal>
</template>
