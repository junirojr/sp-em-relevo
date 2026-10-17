import assert from "node:assert/strict";
import { test } from "node:test";
import { createSelector, memoizeLast } from "./memo.js";

test("BAS-05 memoizeLast returns the cached result while every argument keeps its reference", () => {
  const list = [1, 2, 3];
  let runs = 0;
  const sum = memoizeLast((/** @type {number[]} */ numbers) => {
    runs += 1;
    return { total: numbers.reduce((total, number) => total + number, 0) };
  });

  const first = sum(list);
  const second = sum(list);

  assert.equal(second, first);
  assert.equal(runs, 1);
});

test("BAS-05 memoizeLast recomputes when an argument changes reference, even if equal in value", () => {
  let runs = 0;
  const sum = memoizeLast((/** @type {number[]} */ numbers) => {
    runs += 1;
    return { total: numbers.reduce((total, number) => total + number, 0) };
  });

  const first = sum([1, 2]);
  const second = sum([1, 2]);

  assert.notEqual(second, first);
  assert.deepEqual(second, first);
  assert.equal(runs, 2);
});

test("BAS-05 memoizeLast compares primitives by value and keeps only the last call", () => {
  let runs = 0;
  const label = memoizeLast((/** @type {string} */ code, /** @type {number} */ count) => {
    runs += 1;
    return { text: `${code}:${count}` };
  });

  const first = label("3550308", 1);
  assert.equal(label("3550308", 1), first);
  label("3509502", 1);
  const afterSwitchBack = label("3550308", 1);

  assert.notEqual(afterSwitchBack, first);
  assert.equal(runs, 3);
});

test("BAS-05 createSelector keeps the result reference while its inputs keep theirs", () => {
  const pointer = { pointedCode: "3550308" };
  const selection = { selectedCodes: ["3509502"] };
  const state = { pointer, selection, unrelated: 1 };
  let runs = 0;
  const selectRaised = createSelector(
    [
      (/** @type {typeof state} */ current) => current.pointer.pointedCode,
      (/** @type {typeof state} */ current) => current.selection.selectedCodes,
    ],
    (pointed, selected) => {
      runs += 1;
      return { pointed, selected };
    },
  );

  const first = selectRaised(state);
  const second = selectRaised({ ...state, unrelated: 2 });

  assert.equal(second, first);
  assert.deepEqual(first, { pointed: "3550308", selected: ["3509502"] });
  assert.equal(runs, 1);
});

test("BAS-05 createSelector recomputes only when one of its inputs changes", () => {
  const selection = { selectedCodes: [] };
  const state = { pointer: { pointedCode: "3550308" }, selection };
  const selectRaised = createSelector(
    [
      (/** @type {typeof state} */ current) => current.pointer.pointedCode,
      (/** @type {typeof state} */ current) => current.selection.selectedCodes,
    ],
    (pointed, selected) => ({ pointed, selected }),
  );

  const first = selectRaised(state);
  const second = selectRaised({ ...state, pointer: { pointedCode: "3509502" } });

  assert.notEqual(second, first);
  assert.equal(second.pointed, "3509502");
  assert.equal(second.selected, first.selected);
});
