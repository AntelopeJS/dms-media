<script setup lang="ts">
import type { FileItemPublic } from "../../utils/finder/models";
import { PICKER_DISMISS_GRACE_MS } from "../../composables/picker/usePickerExplorer";

interface Props {
	file: FileItemPublic;
}

const props = defineProps<Props>();

const emit = defineEmits<{ close: [confirmed: boolean] }>();

const { t } = useI18n();

const mountedAt = Date.now();

function handleOpenChange(open: boolean): void {
	if (open) return;
	if (Date.now() - mountedAt < PICKER_DISMISS_GRACE_MS) return;
	emit("close", false);
}
</script>

<template>
	<UModal
		:open="true"
		:title="t('dms.finder.delete.file_confirm_title')"
		:close="{ onClick: () => emit('close', false) }"
		@update:open="handleOpenChange"
	>
		<template #body>
			<div class="flex items-center gap-4">
				<UIcon
					name="i-lucide-triangle-alert"
					class="size-6 shrink-0 text-warning"
				/>
				<p class="text-sm text-toned">
					{{
						t("dms.finder.delete.file_confirm_description", {
							name: props.file.name,
						})
					}}
				</p>
			</div>
		</template>
		<template #footer>
			<div class="flex w-full justify-end gap-2">
				<UButton
					:label="t('dms.finder.delete.cancel')"
					color="neutral"
					variant="ghost"
					@click="emit('close', false)"
				/>
				<UButton
					:label="t('dms.finder.delete.delete')"
					color="error"
					@click="emit('close', true)"
				/>
			</div>
		</template>
	</UModal>
</template>
