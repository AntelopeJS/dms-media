<script setup lang="ts">
interface Props {
  file: FileItemPublic;
}

const props = defineProps<Props>();
</script>

<template>
  <UModal :close="false">
    <template #body>
      <NuxtImg
        :src="props.file.preview"
        :alt="props.file.name"
        class="size-full object-contain"
        :custom="true"
      >
        <template #default="{ src, isLoaded }">
          <img
            v-if="isLoaded"
            :src="src"
            :alt="props.file.name"
            class="size-full object-contain"
          />
          <div v-else class="bg-muted/50 size-full animate-pulse">
            <UIcon
              :name="src ?? 'i-lucide-loader-circle'"
              class="size-10 animate-spin text-amber-500"
            />
          </div>
        </template>
      </NuxtImg>
    </template>
  </UModal>
</template>
