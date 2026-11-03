/**
 * @typedef {import("./media.mjs").Tab} Tab
 * @typedef {{ name: string, mimeType: string, buffer: Buffer }} Chosen
 * @typedef {{ opened: boolean, multiple: boolean, clicks: number, attempts: number, choose: (files: Chosen[]) => Promise<void> }} Picker
 */

/**
 * Makes the page's file inputs answerable without the browser's file picker: a capture listener cancels the click
 * that would open the picker, marks the input it landed on, and counts it. Playwright's `filechooser` event is not
 * used, because its interception turns on without being awaited, so an action right after `waitForEvent` can open
 * no event. Installed once per document, so again after each navigation.
 *
 * @param {Tab} tab The tab
 * @returns {Promise<number>} How many file-input clicks the document has seen so far
 */
async function arm(tab) {
  return tab.page.evaluate(() => {
    const root = document.documentElement;
    if (root.dataset.verifyChooserArmed !== "1") {
      root.dataset.verifyChooserArmed = "1";
      root.dataset.verifyFileInputClicks = "0";
      document.addEventListener(
        "click",
        (event) => {
          const target = event.target;
          if (!(target instanceof HTMLInputElement) || target.type !== "file") return;
          event.preventDefault();
          for (const marked of document.querySelectorAll("[data-verify-chosen]")) marked.removeAttribute("data-verify-chosen");
          target.dataset.verifyChosen = "1";
          root.dataset.verifyFileInputClicks = String(Number(root.dataset.verifyFileInputClicks) + 1);
        },
        true,
      );
    }
    return Number(root.dataset.verifyFileInputClicks);
  });
}

/**
 * @param {Tab} tab The tab
 * @returns {Promise<number>} The file-input clicks counted on the current document
 */
async function clicksOf(tab) {
  return Number(await tab.page.evaluate(() => document.documentElement.dataset.verifyFileInputClicks ?? "0").catch(() => "0"));
}

/**
 * Runs an action that should open the file picker, again while no file-input click is counted (a click that lands
 * before the page hydrates does nothing), and answers the file input it clicked, the way the picker would.
 *
 * @param {Tab} tab The tab
 * @param {() => Promise<unknown>} action What a person does to open the picker
 * @param {number} [timeoutMs] How long to keep trying
 * @returns {Promise<Picker>} Whether a file input was clicked, after how many attempts, whether it takes several
 *   files, and how to answer it
 */
export async function openFilePicker(tab, action, timeoutMs = 15_000) {
  const before = await arm(tab);
  const deadline = Date.now() + timeoutMs;
  let clicks = before;
  let attempts = 0;
  while (clicks <= before && Date.now() < deadline) {
    attempts += 1;
    await arm(tab);
    await action();
    for (let waited = 0; waited < 2500 && clicks <= before; waited += 250) {
      await tab.page.waitForTimeout(250);
      clicks = await clicksOf(tab);
    }
  }
  const input = tab.page.locator("input[type=file][data-verify-chosen]").first();
  const opened = clicks > before;
  const multiple = opened ? await input.evaluate((element) => element instanceof HTMLInputElement && element.multiple).catch(() => false) : false;
  return {
    opened,
    multiple,
    clicks: clicks - before,
    attempts,
    choose: async (files) => {
      if (opened) await input.setInputFiles(files);
    },
  };
}
