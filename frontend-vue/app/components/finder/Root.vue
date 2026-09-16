<script setup lang="ts">
import type { FinderProps } from "../../types/finder";

interface RootProps extends FinderProps {
  initialBinding?: string;
}

const props = withDefaults(defineProps<RootProps>(), {
  supportedLayouts: () => ["grid", "list", "columns"],
  defaultLayout: "grid",
  showSidebar: true,
  showDetails: true,
  initialBinding: undefined,
});

const {
  setSupportedLayouts,
  setDefaultLayout,
  setGlobalShowDetails,
  showDetails,
} = useFinderLayout();
const { handleLoad, map, getFolderIdByBinding } = useFinderStore();

useFinderHooksBuilder()
  .register(createFinderHooksRegistrar)
  .register(createFolderHooksRegistrar)
  .register(createFileHooksRegistrar)
  .register(createNavigationHooksRegistrar)
  .register(createSelectionHooksRegistrar)
  .build();

const hooks = useFinderHooks();

const thisRef = useTemplateRef<HTMLElement>("finder-ref");

useDeselectOnOutsideClick(thisRef, () => {
  hooks.callHook("select:item:clear");
});

onMounted(async () => {
  setDefaultLayout(props.defaultLayout);
  setSupportedLayouts(props.supportedLayouts);
  setGlobalShowDetails(props.showDetails);
  await handleLoad();
  openInitialBindingFolder();
});

function openInitialBindingFolder() {
  if (!props.initialBinding) return;
  const folderId = getFolderIdByBinding(props.initialBinding);
  const folder = folderId ? map.value.folders.get(folderId) : undefined;
  if (folder) hooks.callHook("folder:open", folder);
}
</script>

<template>
  <div ref="finder-ref" class="flex grow overflow-x-scroll sm:overflow-hidden">
    <div
      :class="[
        'relative flex min-h-0 w-full min-w-0 grow',
        showDetails ? 'flex-col-reverse sm:flex-row' : '',
      ]"
      v-bind="$attrs"
    >
      <FinderLayoutPanelShortcuts v-if="showSidebar" />

      <FinderLayoutView />

      <FinderLayoutPanelDetails v-if="showDetails" />
    </div>
  </div>
</template>
