import { guarded } from "../guard.mjs";
import { presetPageJourneys } from "./parts/preset-page.mjs";

/** Named image sizes. Their HTTP checks run in `packages/dms-media/src/test/integration/`, so this feature keeps only the Image sizes page. */
export const journeys = guarded([...presetPageJourneys()]);
