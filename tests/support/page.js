const DEFAULT_VIEWPORT = { width: 1280, height: 900 };
const DEFAULT_SETTLE_TIMEOUT_MS = 15000;

/**
 * @typedef {import("@playwright/test").Browser} Browser
 * @typedef {import("@playwright/test").BrowserContext} BrowserContext
 * @typedef {import("@playwright/test").Page} Page
 * @typedef {import("@playwright/test").BrowserContextOptions} BrowserContextOptions
 *
 * @typedef {{
 *   context: BrowserContext,
 *   page: Page,
 *   consoleProblems: string[]
 * }} TestPageResult
 */

/**
 * Opens the application page, listens to console errors and warnings,
 * and waits for the map to settle.
 * Follows BAS-01.
 *
 * @param {Browser} browser
 * @param {BrowserContextOptions} [contextOptions]
 * @param {string} [path]
 * @returns {Promise<TestPageResult>}
 */
export async function openPage(browser, contextOptions = {}, path = "/") {
  const context = await browser.newContext({
    viewport: DEFAULT_VIEWPORT,
    ...contextOptions,
  });

  const page = await context.newPage();
  /** @type {string[]} */
  const consoleProblems = [];

  page.on("console", (message) => {
    const type = message.type();
    if (type === "error" || type === "warning") {
      consoleProblems.push(`${type}: ${message.text()}`);
    }
  });

  page.on("pageerror", (error) => {
    consoleProblems.push(`pageerror: ${error.message}`);
  });

  let targetPath = path;
  if (
    !targetPath.includes("uf=") &&
    !targetPath.includes("uf=br") &&
    !targetPath.includes("national=true")
  ) {
    let separator = "?";
    if (targetPath.includes("?")) {
      separator = "&";
    }
    targetPath = `${targetPath}${separator}uf=35`;
  }

  await page.goto(targetPath);
  await settle(page);

  return { context, page, consoleProblems };
}

/**
 * Waits for the map inspector to report settled state.
 *
 * @param {Page} page
 * @param {number} [timeoutMs]
 */
export async function settle(page, timeoutMs = DEFAULT_SETTLE_TIMEOUT_MS) {
  await page.waitForTimeout(120);
  await page.waitForFunction(
    () => {
      const inspector = /** @type {any} */ (window).mapInspector;
      if (!inspector) {
        return false;
      }
      return inspector.isSettled() === true;
    },
    null,
    { timeout: timeoutMs },
  );
}
