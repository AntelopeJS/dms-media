import type { InjectionKey } from "vue";
import type { FileItemPublic } from "../../../utils/finder/models";

export interface FinderPickerContext {
	enabled: boolean;
	multiple: boolean;
	matches: (file: FileItemPublic) => boolean;
	pick: (files: FileItemPublic[]) => void;
}

const SYMBOL: InjectionKey<FinderPickerContext> = Symbol("finder-picker");

export function useProvideFinderPicker(
	context: FinderPickerContext,
): FinderPickerContext {
	provide(SYMBOL, context);
	return context;
}

export function useFinderPicker(): FinderPickerContext | null {
	return inject(SYMBOL, null);
}
