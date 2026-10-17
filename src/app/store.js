/**
 * @template State, Action
 * @typedef {Object} Store
 * @property {(action: Action) => State} dispatch runs the reducer and returns the current state;
 *   when the reducer returns the same reference, nothing changes and no subscriber runs.
 * @property {() => State} getState
 * @property {(listener: (state: State) => void) => () => void} subscribe registers a listener
 *   for state changes and returns the function that removes it.
 */

/**
 * Creates the single store of the application. A dispatch whose reducer returns the same
 * reference keeps that reference and notifies nobody, so memoized selectors downstream stay put.
 *
 * @template State, Action
 * @param {(state: State, action: Action) => State} reduce
 * @param {State} initialState
 * @returns {Store<State, Action>}
 */
export function createStore(reduce, initialState) {
  let state = initialState;
  /** @type {Set<(state: State) => void>} */
  const listeners = new Set();

  return {
    dispatch(action) {
      const nextState = reduce(state, action);
      if (nextState === state) {
        return state;
      }
      state = nextState;
      notifyListeners(listeners, state);
      return state;
    },
    getState() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * Runs a snapshot of the listeners, so one added during this round waits for the next change.
 *
 * @template State
 * @param {Set<(state: State) => void>} listeners
 * @param {State} state
 */
function notifyListeners(listeners, state) {
  for (const listener of [...listeners]) {
    listener(state);
  }
}
