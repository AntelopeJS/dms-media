export interface FileGroupDefinition {
	id: string;
	icon: string;
	tint: string;
	barClass: string;
	labelKey: string;
	matches: (mimetype: string) => boolean;
}

const SVG_MIMETYPE = "image/svg+xml";
const PDF_MIMETYPE = "application/pdf";
const SPREADSHEET_MIMETYPES = [
	"application/vnd.ms-excel",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"text/csv",
];

export const FILE_GROUPS: FileGroupDefinition[] = [
	{
		id: "vector",
		icon: "i-ph-bezier-curve",
		tint: "bg-info/10 text-info",
		barClass: "bg-info",
		labelKey: "dms_media.groups.vector",
		matches: (mimetype) => mimetype === SVG_MIMETYPE,
	},
	{
		id: "image",
		icon: "i-ph-image",
		tint: "bg-primary/10 text-primary",
		barClass: "bg-primary",
		labelKey: "dms_media.groups.image",
		matches: (mimetype) => mimetype.startsWith("image/"),
	},
	{
		id: "video",
		icon: "i-ph-play",
		tint: "bg-warning/10 text-warning",
		barClass: "bg-warning",
		labelKey: "dms_media.groups.video",
		matches: (mimetype) => mimetype.startsWith("video/"),
	},
	{
		id: "pdf",
		icon: "i-ph-file-pdf",
		tint: "bg-error/10 text-error",
		barClass: "bg-error",
		labelKey: "dms_media.groups.pdf",
		matches: (mimetype) => mimetype === PDF_MIMETYPE,
	},
	{
		id: "sheet",
		icon: "i-ph-table",
		tint: "bg-success/10 text-success",
		barClass: "bg-success",
		labelKey: "dms_media.groups.sheet",
		matches: (mimetype) => SPREADSHEET_MIMETYPES.includes(mimetype),
	},
];

export const FALLBACK_FILE_GROUP: FileGroupDefinition = {
	id: "document",
	icon: "i-ph-file",
	tint: "bg-elevated text-muted",
	barClass: "bg-inverted",
	labelKey: "dms_media.groups.document",
	matches: () => true,
};

export const FILTERABLE_FILE_GROUPS: FileGroupDefinition[] = [
	...FILE_GROUPS,
	FALLBACK_FILE_GROUP,
];

export function resolveFileGroup(mimetype: string): FileGroupDefinition {
	return (
		FILE_GROUPS.find((group) => group.matches(mimetype)) ?? FALLBACK_FILE_GROUP
	);
}
