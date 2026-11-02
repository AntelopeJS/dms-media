/**
 * The screenshots of the dms-media docs, taken on the Helio demo. The
 * onboarding runs first and creates the administrator every scene uses. All
 * scenes share one browser session, so no scene signs out.
 */
export default [
  {
    id: "onboarding",
    route: "/onboarding",
    setup: true,
    steps: [
      { action: "fill", selector: 'input[name="name"]', value: "Helio" },
      {
        action: "click",
        selector: 'button:has-text("Continue to administrator")',
      },
      { action: "wait", selector: 'input[name="firstName"]' },
      { action: "fill", selector: 'input[name="firstName"]', value: "Sophie" },
      { action: "fill", selector: 'input[name="lastName"]', value: "Lambert" },
      {
        action: "fill",
        selector: 'input[name="email"]',
        value: "sophie.lambert@helio.be",
      },
      {
        action: "fill",
        selector: 'input[name="password"]',
        value: "HelioDocs2026!",
      },
      {
        action: "click",
        selector: 'button:has-text("Create administrator account")',
      },
      { action: "wait", selector: 'button:has-text("Open the dashboard")' },
      { action: "click", selector: 'button:has-text("Open the dashboard")' },
    ],
  },
  {
    id: "overview",
    route: "/modules/media/overview",
    output: "packages/dms-media/docs/images/captures/overview.webp",
  },
  {
    id: "library",
    route: "/modules/media/files",
    steps: [{ action: "wait", selector: "[data-folder-card]" }],
    output: "packages/dms-media/docs/images/captures/library.webp",
  },
  {
    id: "uploads",
    route: "/modules/media/uploads",
    output: "packages/dms-media/docs/images/captures/uploads.webp",
  },
  {
    id: "activity",
    route: "/modules/media/activity",
    output: "packages/dms-media/docs/images/captures/activity.webp",
  },
  {
    id: "presets",
    route: "/modules/media/presets",
    steps: [{ action: "wait", selector: 'text="antelope.config.ts"' }],
    crop: 'text="antelope.config.ts" >> xpath=ancestor::div[contains(., "Change a size here")][1]',
    output: "packages/dms-media/docs/images/captures/presets.webp",
  },
  {
    id: "file",
    route: "/modules/media/files",
    steps: [
      {
        action: "click",
        selector: '[data-folder-card]:has-text("Photos de chantier")',
      },
      { action: "press", key: "Enter" },
      { action: "wait", selector: '[data-folder-card]:has-text(" - ")' },
      {
        action: "click",
        selector: '[data-folder-card]:has-text(" - ") >> nth=0',
      },
      { action: "press", key: "Enter" },
      { action: "wait", selector: "[data-asset-id]" },
      { action: "click", selector: "[data-asset-id] >> nth=0" },
      { action: "press", key: "Enter" },
      { action: "wait", selector: 'button:has-text("Edit image")' },
    ],
    output: "packages/dms-media/docs/images/captures/file.webp",
  },
  {
    id: "editor",
    route: "/modules/media/files",
    steps: [
      {
        action: "click",
        selector: '[data-folder-card]:has-text("Photos de chantier")',
      },
      { action: "press", key: "Enter" },
      { action: "wait", selector: '[data-folder-card]:has-text(" - ")' },
      {
        action: "click",
        selector: '[data-folder-card]:has-text(" - ") >> nth=0',
      },
      { action: "press", key: "Enter" },
      { action: "wait", selector: "[data-asset-id]" },
      { action: "click", selector: "[data-asset-id] >> nth=0" },
      { action: "press", key: "Enter" },
      { action: "wait", selector: 'button:has-text("Edit image")' },
      { action: "click", selector: 'button:has-text("Edit image")' },
      { action: "wait", selector: "[data-aspect]" },
    ],
    output: "packages/dms-media/docs/images/captures/editor.webp",
  },
  {
    id: "asset-field",
    route: "/helio/settings",
    steps: [{ action: "wait", selector: 'button:has-text("Choose an image")' }],
    crop: '[data-section="branding"]',
    output: "packages/dms-media/docs/images/captures/asset-field.webp",
  },
  {
    id: "asset-picker",
    route: "/helio/settings",
    steps: [
      { action: "wait", selector: 'button:has-text("Choose an image")' },
      { action: "click", selector: 'button:has-text("Choose an image")' },
      { action: "wait", selector: 'text="Choose from the library"' },
    ],
    output: "packages/dms-media/docs/images/captures/asset-picker.webp",
  },
];
