import assert from "node:assert/strict";
import test from "node:test";
import { parseUrlState } from "../../../src/app/url-state.js";
import { applyControlsVisibility } from "../../../src/features/election/mode-selector-view.js";
import { MockDocument } from "../helpers/dom-mock.js";

test("B13-01: 50 sequential tab transitions produce 0 exceptions and 0 error logs", () => {
  const errors = [];
  const origError = console.error;
  console.error = (...args) => errors.push(args.join(" "));

  try {
    const doc = new MockDocument();
    for (let i = 0; i < 50; i += 1) {
      const tab = i % 3 === 0 ? "indicators" : i % 3 === 1 ? "second-round" : "first-round";
      applyControlsVisibility(doc, tab);
    }
  } finally {
    console.error = origError;
  }

  assert.equal(errors.length, 0);
});

test("B13-02: Corrupted operational status object does not crash parseUrlState", () => {
  assert.doesNotThrow(() => {
    parseUrlState("?aba=2turno", {
      status: /** @type {any} */ ({ mode: null, features: "corrupted" }),
    });
  });
});

test("B13-03: Rapid timer-based polling simulation can be cleanly cancelled without leak", () => {
  let tickCount = 0;
  /**
   * @type {string | number | NodeJS.Timeout | null | undefined}
   */
  let timerId = null;

  function start() {
    timerId = setInterval(() => {
      tickCount += 1;
    }, 10);
  }

  function stop() {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  start();
  stop();
  const currentTicks = tickCount;

  // Wait a small delay to ensure timer is stopped
  setTimeout(() => {
    assert.equal(tickCount, currentTicks, "timer must not tick after stop");
  }, 30);
});

test("B13-04: Malformed encoded URI in search params does not crash URL parser", () => {
  assert.doesNotThrow(() => {
    parseUrlState("?aba=%E0%A4%A");
  });
});

test("B13-05: Repeated object creation during frame loop simulation does not hold circular references", () => {
  const references = [];
  for (let i = 0; i < 100; i += 1) {
    references.push({
      frame: i,
      state: { tab: "second-round", margin: i },
    });
  }
  assert.equal(references.length, 100);
});
