import { expect, test } from "@playwright/test";
import { openPage } from "../../tests/support/page.js";

const SAO_PAULO_CODE = "3550308";
const PREVIOUS_HOOKS_NAME = "spMapLab";

// Hooks frozen by the plan (section 4.4), each with the arguments used to call it.
const FROZEN_HOOK_CALLS = [
  { name: "isSettled", args: [] },
  { name: "readFrameCount", args: [] },
  { name: "readTimings", args: [] },
  { name: "readEngineStats", args: [] },
  { name: "readState", args: [] },
  { name: "readSelection", args: [] },
  { name: "readCodes", args: [] },
  { name: "readCamera", args: [] },
  { name: "readLimits", args: [] },
  { name: "readAnimationConstants", args: [] },
  { name: "inspect", args: [SAO_PAULO_CODE] },
  { name: "findScreenPoint", args: [SAO_PAULO_CODE] },
  { name: "readGroundPointAt", args: [640, 450] },
  { name: "projectGroundPoint", args: [{ x: 0, y: 0, z: 0 }] },
  { name: "readLegend", args: [] },
  { name: "readDataSource", args: [] },
];

test("PUB-07 mapInspector is frozen and holds only functions", async ({ browser }) => {
  const { context, page } = await openPage(browser);
  try {
    const shape = await page.evaluate(describeInspector);

    expect(shape.isFrozen).toBe(true);
    expect(shape.nonFunctionNames).toEqual([]);
  } finally {
    await context.close();
  }
});

test("PUB-07 mapInspector exposes every hook frozen by the plan", async ({ browser }) => {
  const { context, page } = await openPage(browser);
  try {
    const shape = await page.evaluate(describeInspector);

    const frozenNames = FROZEN_HOOK_CALLS.map((call) => call.name);
    const missingNames = frozenNames.filter((name) => !shape.names.includes(name));
    expect(missingNames).toEqual([]);
  } finally {
    await context.close();
  }
});

test("PUB-07 calling every frozen hook leaves readState unchanged", async ({ browser }) => {
  const { context, page } = await openPage(browser);
  try {
    const hooksThatChangeState = await page.evaluate(findHooksThatChangeState, FROZEN_HOOK_CALLS);

    expect(hooksThatChangeState).toEqual([]);
  } finally {
    await context.close();
  }
});

test("PUB-07 the previous hooks name does not exist anymore", async ({ browser }) => {
  const { context, page } = await openPage(browser);
  try {
    const previousNameType = await page.evaluate(
      (name) => typeof (/** @type {any} */ (window)[name]),
      PREVIOUS_HOOKS_NAME,
    );

    expect(previousNameType).toBe("undefined");
  } finally {
    await context.close();
  }
});

/**
 * Runs in the page. Describes the hooks object without calling any hook.
 */
function describeInspector() {
  const inspector = /** @type {any} */ (window).mapInspector;
  const entries = Object.entries(inspector);
  return {
    isFrozen: Object.isFrozen(inspector),
    names: entries.map(([name]) => name),
    nonFunctionNames: entries
      .filter(([, hook]) => typeof hook !== "function")
      .map(([name]) => name),
  };
}

/**
 * Runs in the page. Calls each hook once and lists the ones after which readState differs.
 *
 * @param {{ name: string, args: unknown[] }[]} calls
 * @returns {string[]}
 */
function findHooksThatChangeState(calls) {
  const inspector = /** @type {any} */ (window).mapInspector;
  const readSnapshot = () => JSON.stringify(inspector.readState());
  /** @type {string[]} */
  const hooksThatChangeState = [];
  for (const { name, args } of calls) {
    const snapshotBefore = readSnapshot();
    inspector[name](...args);
    if (readSnapshot() !== snapshotBefore) {
      hooksThatChangeState.push(name);
    }
  }
  return hooksThatChangeState;
}
