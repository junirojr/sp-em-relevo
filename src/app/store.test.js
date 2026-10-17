import assert from "node:assert/strict";
import { test } from "node:test";
import { createStore } from "./store.js";

/**
 * @typedef {{ count: number, label: string }} CounterState
 * @typedef {{ type: "counter/incremented" } | { type: "counter/ignored" }} CounterAction
 */

/**
 * @param {CounterState} state
 * @param {CounterAction} action
 * @returns {CounterState}
 */
function reduceCounter(state, action) {
  if (action.type !== "counter/incremented") {
    return state;
  }
  return { ...state, count: state.count + 1 };
}

function createCounterStore() {
  return createStore(reduceCounter, { count: 0, label: "contador" });
}

test("BAS-05 store starts with the initial state", () => {
  const initialState = { count: 0, label: "contador" };
  const store = createStore(reduceCounter, initialState);

  assert.equal(store.getState(), initialState);
});

test("BAS-05 dispatch that changes nothing keeps and returns the same state reference", () => {
  const store = createCounterStore();
  const before = store.getState();

  const returned = store.dispatch({ type: "counter/ignored" });

  assert.equal(returned, before);
  assert.equal(store.getState(), before);
});

test("BAS-05 dispatch that changes nothing does not notify subscribers", () => {
  const store = createCounterStore();
  let notifications = 0;
  store.subscribe(() => {
    notifications += 1;
  });

  store.dispatch({ type: "counter/ignored" });

  assert.equal(notifications, 0);
});

test("BAS-05 dispatch that changes the state notifies subscribers with the new state", () => {
  const store = createCounterStore();
  /** @type {CounterState[]} */
  const received = [];
  store.subscribe((state) => {
    received.push(state);
  });

  const returned = store.dispatch({ type: "counter/incremented" });

  assert.equal(returned.count, 1);
  assert.equal(store.getState(), returned);
  assert.deepEqual(received, [returned]);
});

test("BAS-05 unsubscribe stops further notifications", () => {
  const store = createCounterStore();
  let notifications = 0;
  const unsubscribe = store.subscribe(() => {
    notifications += 1;
  });

  store.dispatch({ type: "counter/incremented" });
  unsubscribe();
  store.dispatch({ type: "counter/incremented" });

  assert.equal(notifications, 1);
  assert.equal(store.getState().count, 2);
});

test("BAS-05 a subscriber added during a notification waits for the next change", () => {
  const store = createCounterStore();
  let lateNotifications = 0;
  const unsubscribeFirst = store.subscribe(() => {
    unsubscribeFirst();
    store.subscribe(() => {
      lateNotifications += 1;
    });
  });

  store.dispatch({ type: "counter/incremented" });
  assert.equal(lateNotifications, 0);
  store.dispatch({ type: "counter/incremented" });

  assert.equal(lateNotifications, 1);
});
