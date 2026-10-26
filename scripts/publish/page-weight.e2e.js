import zlib from "node:zlib";
import { expect, test } from "@playwright/test";
import { settle } from "../../tests/support/page.js";

export const PAGE_WEIGHT_CEILING_BYTES = 819200;
export const ELECTION_CODE_CEILING_BYTES = 180000;
export const FIRST_ROUND_OFFICE_CEILING_BYTES = 120000;
export const REPLAY_CEILING_BYTES = 300000;

const VIEWPORT = { width: 1280, height: 900 };

/**
 * @typedef {import("@playwright/test").Page} Page
 * @typedef {import("@playwright/test").Response} Response
 * @typedef {import("@playwright/test").TestInfo} TestInfo
 * @typedef {{ path: string, rawBytes: number, gzipBytes: number | null }} Download
 * @typedef {{ rawBytes: number, gzipBytes: number | null, downloads: Download[] }} PageWeight
 */

test("PUB-04 same-origin bytes until isSettled stay within the 800 KB ceiling", async ({
  browser,
  baseURL,
}, testInfo) => {
  const origin = readOrigin(baseURL);
  const context = await browser.newContext({ viewport: VIEWPORT });
  try {
    const page = await context.newPage();
    const recorder = recordSameOriginDownloads(page, origin);
    await page.goto("/");
    await settle(page);
    const pageWeight = await recorder.stopAndMeasure();

    await recordCompressedSize(testInfo, pageWeight);

    const weightLabel = `same-origin bytes until isSettled (gzip ${pageWeight.gzipBytes})`;
    const downloadedPaths = pageWeight.downloads.map((download) => download.path);
    expect(downloadedPaths).toContain("/");
    expect(
      downloadedPaths.some((p) => p.startsWith("/data/election/")),
      "Default Indicators boot must not download election data (ELE-20)",
    ).toBe(false);
    expect(pageWeight.rawBytes, weightLabel).toBeLessThanOrEqual(PAGE_WEIGHT_CEILING_BYTES);
  } finally {
    await context.close();
  }
});

/**
 * @param {string | undefined} baseURL
 * @returns {string}
 */
export function readOrigin(baseURL) {
  if (!baseURL) {
    throw new Error("PUB-04 needs use.baseURL from playwright.config.js");
  }
  return new URL(baseURL).origin;
}

/**
 * Starts listening to the responses of one page. The three.js module comes from the CDN, so
 * its origin differs and it never counts.
 *
 * @param {Page} page
 * @param {string} origin
 */
export function recordSameOriginDownloads(page, origin) {
  /** @type {Promise<Download>[]} */
  const pendingDownloads = [];
  /** @param {Response} response */
  const handleResponse = (response) => {
    if (!isSameOriginSuccess(response, origin)) {
      return;
    }
    pendingDownloads.push(readDownload(response));
  };
  page.on("response", handleResponse);

  return {
    async stopAndMeasure() {
      page.off("response", handleResponse);
      return sumDownloads(await Promise.all(pendingDownloads));
    },
  };
}

/**
 * Splits incremental downloads triggered after entering an election tab into code,
 * first-round office data and replay payloads (PUB-09).
 *
 * @param {Download[]} downloads
 * @returns {{
 *   codeBytes: number,
 *   firstRoundOfficeBytes: number,
 *   replayBytes: number
 * }}
 */
export function classifyIncrementalDownloads(downloads) {
  let codeBytes = 0;
  let firstRoundOfficeBytes = 0;
  let replayBytes = 0;

  for (const download of downloads) {
    if (download.path.endsWith(".js") || download.path.endsWith(".css")) {
      codeBytes += download.rawBytes;
      continue;
    }
    if (download.path.includes("replay")) {
      replayBytes += download.rawBytes;
      continue;
    }
    if (download.path.startsWith("/data/election/")) {
      firstRoundOfficeBytes += download.rawBytes;
    }
  }

  return {
    codeBytes,
    firstRoundOfficeBytes,
    replayBytes,
  };
}

/**
 * @param {Response} response
 * @param {string} origin
 */
function isSameOriginSuccess(response, origin) {
  const isSameOrigin = new URL(response.url()).origin === origin;
  return isSameOrigin && response.ok();
}

/**
 * @param {Response} response
 * @returns {Promise<Download>}
 */
async function readDownload(response) {
  const sizes = await response.request().sizes();
  if (sizes.responseBodySize < 0) throw new Error("Missing network byte measurement");
  let gzipBytes = null;
  try {
    gzipBytes = zlib.gzipSync(await response.body()).length;
  } catch {
    // Chromium can evict a module body after consuming it; network bytes remain authoritative.
  }
  return {
    path: new URL(response.url()).pathname,
    rawBytes: sizes.responseBodySize,
    gzipBytes,
  };
}

/**
 * @param {Download[]} downloads
 * @returns {PageWeight}
 */
function sumDownloads(downloads) {
  return {
    rawBytes: downloads.reduce((total, download) => total + download.rawBytes, 0),
    gzipBytes: sumCompressedBytes(downloads),
    downloads,
  };
}

/**
 * The compressed size is only recorded, never asserted: it goes to the test annotations and to
 * an attachment next to the other results.
 *
 * @param {TestInfo} testInfo
 * @param {PageWeight} pageWeight
 */
export async function recordCompressedSize(testInfo, pageWeight) {
  testInfo.annotations.push({ type: "gzip-bytes", description: String(pageWeight.gzipBytes) });
  await testInfo.attach("page-weight.json", {
    body: JSON.stringify(pageWeight, null, 2),
    contentType: "application/json",
  });
}

test("PUB-09 entering election and first-round office stays within incremental code and data budgets", async ({
  browser,
  baseURL,
}, testInfo) => {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  await page.route("https://resultados.tse.jus.br/**", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  try {
    await page.goto("/");
    await settle(page);
    const recorder = recordSameOriginDownloads(page, readOrigin(baseURL));
    await page.getByRole("button", { name: "Eleições TSE", exact: true }).click();
    await page.locator('#mode-selector-slot input[value="first-round"]').check();
    await expect(
      page.locator("#election-rankings-view .candidate-ranking-item").first(),
    ).toBeVisible();
    await settle(page);
    const weight = await recorder.stopAndMeasure();
    const incremental = classifyIncrementalDownloads(weight.downloads);
    await recordCompressedSize(testInfo, weight);
    expect(incremental.codeBytes).toBeLessThanOrEqual(ELECTION_CODE_CEILING_BYTES);
    expect(incremental.firstRoundOfficeBytes).toBeLessThanOrEqual(FIRST_ROUND_OFFICE_CEILING_BYTES);
    expect(incremental.replayBytes).toBe(0);
  } finally {
    await context.close();
  }
});

/** @param {Download[]} downloads
 * @returns {number | null} */
function sumCompressedBytes(downloads) {
  let total = 0;
  for (const download of downloads) {
    if (download.gzipBytes === null) return null;
    total += download.gzipBytes;
  }
  return total;
}
