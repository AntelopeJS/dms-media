import { defineComponent, h } from "vue";
import FileHeader from "../../app/components/FileHeader.vue";
import FilePreview from "../../app/components/FilePreview.vue";
import FileProperties from "../../app/components/FileProperties.vue";

/** The file page's blocks, as the page lays them out. */
export const FilePage = defineComponent({
  setup: () => () =>
    h("div", [h(FileHeader), h(FilePreview), h(FileProperties)]),
});
