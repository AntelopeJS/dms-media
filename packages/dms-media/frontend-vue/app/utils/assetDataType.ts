import { h } from 'vue'
import AssetValue from '../components/field/AssetValue.vue'

/** Id of the data type `AssetType` declares on the server. */
const ASSET_DATA_TYPE_ID = 'asset'

function isEmptyValue(value: unknown): boolean {
	return !value || (Array.isArray(value) && value.length === 0)
}

/**
 * Words an asset field's value wherever the DMS shows it outside the field
 * (a form's "changed, was …" note, a table cell): the files' names and
 * thumbnails instead of their ids.
 */
export function registerAssetDataType(): void {
	useDataTypes().registerDataType({
		id: ASSET_DATA_TYPE_ID,
		formatter: {
			default: (value: unknown) =>
				isEmptyValue(value) ? '' : h(AssetValue, { value }),
		},
	})
}
