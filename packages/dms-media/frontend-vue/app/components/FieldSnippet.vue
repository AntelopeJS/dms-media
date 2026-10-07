<script setup lang="ts">
import CodeBlock from './shared/CodeBlock.vue'

const { t } = useI18n()
const declaration = `import { AssetType } from "@antelopejs/interface-dms-media";

new AssetType({
  multiple: true,
  max: 8,
  mimetypes: ["image/*"],
  binding: {
    id: "products.gallery",
    folderName: "Product gallery",
    permissionsFromPage: ProductsPage,
  },
});`
const dependency = 'pnpm add @antelopejs/interface-dms-media'
</script>

<template>
	<div class="flex flex-col gap-4 p-1">
		<CodeBlock :code="dependency" label="shell" />
		<CodeBlock :code="declaration" label="src/pages/products.ts" />
		<ul class="text-muted flex list-disc flex-col gap-1 ps-5 text-[13px]">
			<li>{{ t('dms_media.field.code.notes.value') }}</li>
			<li>{{ t('dms_media.field.code.notes.binding') }}</li>
			<li>{{ t('dms_media.field.code.notes.rights') }}</li>
		</ul>
	</div>
</template>
