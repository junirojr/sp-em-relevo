import zlib from "node:zlib";
import { expect, test } from "@playwright/test";
import { settle } from "../../tests/support/page.js";

const PAGE_WEIGHT_CEILING_BYTES = 819200;
const VIEWPORT = { width: 1280, height: 900 };

/**
 * @typedef {import("@playwright/test").Page} Page
 * @typedef {import("@playwright/test").Response} Response
 * @typedef {import("@playwright/test").TestInfo} TestInfo
 * @typedef {{ path: string, rawBytes: number, gzipBytes: number }} Download
 * @typedef {{ rawBytes: number, gzipBytes: number, downloads: Download[] }} PageWeight
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
    expect(pageWeight.downloads.map((download) => download.path)).toContain("/");
    expect(pageWeight.rawBytes, weightLabel).toBeLessThanOrEqual(PAGE_WEIGHT_CEILING_BYTES);
  } finally {
    await context.close();
  }
});

/**
 * @param {string | undefined} baseURL
 * @returns {string}
 */
function readOrigin(baseURL) {
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
function recordSameOriginDownloads(page, origin) {
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
  const body = await response.body();
  return {
    path: new URL(response.url()).pathname,
    rawBytes: body.length,
    gzipBytes: zlib.gzipSync(body).length,
  };
}

/**
 * @param {Download[]} downloads
 * @returns {PageWeight}
 */
function sumDownloads(downloads) {
  return {
    rawBytes: downloads.reduce((total, download) => total + download.rawBytes, 0),
    gzipBytes: downloads.reduce((total, download) => total + download.gzipBytes, 0),
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
async function recordCompressedSize(testInfo, pageWeight) {
  testInfo.annotations.push({ type: "gzip-bytes", description: String(pageWeight.gzipBytes) });
  await testInfo.attach("page-weight.json", {
    body: JSON.stringify(pageWeight, null, 2),
    contentType: "application/json",
  });
}
