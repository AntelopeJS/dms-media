const TIME_UNITS = {
	y: 31536000000,
	M: 2592000000,
	w: 604800000,
	d: 86400000,
	h: 3600000,
	m: 60000,
} as const;

export type TranslateFunction = (
	key: string,
	params?: Record<string, unknown>,
) => string;

const RELATIVE_DATE_LEVELS = [
	{ threshold: TIME_UNITS.m, key: "common.time.just_now" },
	{
		threshold: TIME_UNITS.h,
		divisor: TIME_UNITS.m,
		key: "common.time.relative_minutes_ago",
	},
	{
		threshold: TIME_UNITS.d,
		divisor: TIME_UNITS.h,
		key: "common.time.relative_hours_ago",
	},
	{
		threshold: TIME_UNITS.w,
		divisor: TIME_UNITS.d,
		key: "common.time.relative_days_ago",
	},
	{
		threshold: TIME_UNITS.M,
		divisor: TIME_UNITS.w,
		key: "common.time.relative_weeks_ago",
	},
	{
		threshold: TIME_UNITS.y,
		divisor: TIME_UNITS.M,
		key: "common.time.relative_months_ago",
	},
];

export function formatRelativeDate(
	date: Date | string | number,
	t: TranslateFunction,
	_locale?: string,
): string {
	const timestamp =
		date instanceof Date ? date.getTime() : new Date(date).getTime();
	const diffMs = Date.now() - timestamp;

	if (diffMs < 0) return t("common.time.relative_future");

	for (const level of RELATIVE_DATE_LEVELS) {
		if (diffMs < level.threshold) {
			return level.divisor != null
				? t(level.key, { count: Math.floor(diffMs / level.divisor) })
				: t(level.key);
		}
	}

	return t("common.time.relative_years_ago", {
		count: Math.floor(diffMs / TIME_UNITS.y),
	});
}
