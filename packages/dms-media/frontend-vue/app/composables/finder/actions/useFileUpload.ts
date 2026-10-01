import type { Ref } from "vue";

interface Options {
	multiple: boolean;
	onSelected: (files: File[]) => void;
}

export const useFinderUpload = (
	input?: Ref<HTMLInputElement | null>,
	options?: Partial<Options>,
) => {
	const { multiple = true, onSelected } = options ?? {};

	const { handleUploadFiles } = useFinderStore();
	const { openedFolder } = useFinderContext();

	function handleProcessFiles(files: FileList | File[]): File[] {
		const fileArray = Array.from(files);
		void handleUploadFiles(fileArray, openedFolder.value?.id ?? null);
		onSelected?.(fileArray);
		return fileArray;
	}

	function handleInputChange(event: Event): void {
		const target = event.target as HTMLInputElement;
		const files = target.files;

		if (files?.length) {
			handleProcessFiles(files);
		}

		target.value = "";
	}

	function triggerUpload(): void {
		input?.value?.click();
	}

	return {
		multiple,
		triggerUpload,
		onProcessFiles: handleProcessFiles,
		onInputChange: handleInputChange,
	};
};
