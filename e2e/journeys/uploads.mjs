import { guarded } from "../guard.mjs";
import { pickerJourneys } from "./parts/pickers.mjs";
import { uploadPageJourneys } from "./parts/upload-page.mjs";

/** Uploads go from the browser straight to the storage. Their HTTP checks run in `packages/dms-media/src/test/integration/`, so this feature keeps only the browser flows. */
export const journeys = guarded([...uploadPageJourneys(), ...pickerJourneys()]);
