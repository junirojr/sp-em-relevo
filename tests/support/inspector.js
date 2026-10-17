import { settle } from "./page.js";

/**
 * @typedef {import("@playwright/test").Page} Page
 * @typedef {{ x: number, y: number }} Point
 */

/**
 * @param {Page} page
 * @param {string} code
 * @returns {Promise<any>}
 */
export async function inspect(page, code) {
  return page.evaluate((c) => {
    const inspector = /** @type {any} */ (window).mapInspector;
    return inspector.inspect(c);
  }, code);
}

/**
 * @param {Page} page
 * @returns {Promise<number>}
 */
export async function readFrameCount(page) {
  return page.evaluate(() => {
    const inspector = /** @type {any} */ (window).mapInspector;
    return inspector.readFrameCount();
  });
}

/**
 * @param {Page} page
 * @returns {Promise<any>}
 */
export async function readEngineStats(page) {
  return page.evaluate(() => {
    const inspector = /** @type {any} */ (window).mapInspector;
    return inspector.readEngineStats();
  });
}

/**
 * @param {Page} page
 * @returns {Promise<any>}
 */
export async function readState(page) {
  return page.evaluate(() => {
    const inspector = /** @type {any} */ (window).mapInspector;
    return inspector.readState();
  });
}

/**
 * @param {Page} page
 * @returns {Promise<any>}
 */
export async function readSelection(page) {
  return page.evaluate(() => {
    const inspector = /** @type {any} */ (window).mapInspector;
    return inspector.readSelection();
  });
}

/**
 * @param {Page} page
 * @returns {Promise<string[]>}
 */
export async function readCodes(page) {
  return page.evaluate(() => {
    const inspector = /** @type {any} */ (window).mapInspector;
    return inspector.readCodes();
  });
}

/**
 * @param {Page} page
 * @returns {Promise<any>}
 */
export async function readCamera(page) {
  return page.evaluate(() => {
    const inspector = /** @type {any} */ (window).mapInspector;
    return inspector.readCamera();
  });
}

/**
 * @param {Page} page
 * @returns {Promise<any>}
 */
export async function readLimits(page) {
  return page.evaluate(() => {
    const inspector = /** @type {any} */ (window).mapInspector;
    return inspector.readLimits();
  });
}

/**
 * @param {Page} page
 * @param {string} code
 * @returns {Promise<Point | null>}
 */
export async function findScreenPoint(page, code) {
  return page.evaluate((c) => {
    const inspector = /** @type {any} */ (window).mapInspector;
    return inspector.findScreenPoint(c);
  }, code);
}

/**
 * Aims the pointer at a municipality, correcting for tilt until settled.
 * Follows the legacy aimAt logic.
 *
 * @param {Page} page
 * @param {string} code
 * @returns {Promise<Point | null>}
 */
export async function aimAt(page, code) {
  let point = await findScreenPoint(page, code);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (!point) {
      return null;
    }
    await page.mouse.move(point.x, point.y, { steps: 6 });
    await settle(page);
    const settledPoint = await findScreenPoint(page, code);
    if (!settledPoint) {
      return point;
    }
    const distance = Math.hypot(settledPoint.x - point.x, settledPoint.y - point.y);
    if (distance < 1) {
      return settledPoint;
    }
    point = settledPoint;
  }
  return point;
}

/**
 * Clicks a municipality unit by aiming at it first.
 *
 * @param {Page} page
 * @param {string} code
 * @returns {Promise<Point | null>}
 */
export async function clickUnit(page, code) {
  const point = await aimAt(page, code);
  if (!point) {
    return null;
  }
  await page.mouse.click(point.x, point.y);
  await settle(page);
  return point;
}
