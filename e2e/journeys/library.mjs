import { guarded } from "../guard.mjs";
import { explorerJourneys } from "./parts/explorer.mjs";
import { layoutJourneys } from "./parts/layout.mjs";
import { shortcutJourneys } from "./parts/shortcuts.mjs";
import { starJourneys } from "./parts/stars.mjs";
import { treeIconJourneys } from "./parts/tree-icons.mjs";

/** Browsing the library: the explorer, its shortcuts, stars, layout and tree icons. Its HTTP checks (search, smart views, facets, sorts and the modified windows) run in `packages/dms-media/src/test/integration/`. */
export const journeys = guarded([
  ...explorerJourneys(),
  ...shortcutJourneys(),
  ...starJourneys(),
  ...layoutJourneys(),
  ...treeIconJourneys(),
]);
