const FILE_SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;
const FILE_SIZE_THRESHOLD = 1024;

export function formatFileSize(bytes: number): string {
	if (bytes === 0) return `0 ${FILE_SIZE_UNITS[0]}`;
	let index = 0;
	let size = bytes;
	while (size >= FILE_SIZE_THRESHOLD && index < FILE_SIZE_UNITS.length - 1) {
		size /= FILE_SIZE_THRESHOLD;
		index++;
	}
	const formatted =
		index === 0 ? size.toString() : size.toFixed(1).replace(/\.0$/, "");
	return `${formatted} ${FILE_SIZE_UNITS[index]}`;
}
