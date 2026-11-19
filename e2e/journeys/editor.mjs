import { guarded } from "../guard.mjs";
import { editorPageJourneys } from "./parts/editor-page.mjs";
import { editorPointerJourneys } from "./parts/editor-pointer.mjs";
import { rotationJourneys } from "./parts/rotation.mjs";

/** Crop and rotation in the editor: the page, the crop frame and the turns; the server side runs in the integration suite. */
export const journeys = guarded([
  ...editorPageJourneys(),
  ...editorPointerJourneys(),
  ...rotationJourneys(),
]);
