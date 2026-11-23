import { defineComponent, h } from "vue";
import { useFieldFolders } from "../../app/composables/useFieldFolders";

/** A field bound to `demo.cover`, which shows the name of its folder. */
export const BoundFieldProbe = defineComponent({
  setup() {
    const { boundFolder } = useFieldFolders("demo.cover");
    return () => h("p", boundFolder.value?.name ?? "no folder");
  },
});
