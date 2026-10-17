/**
 * Builds a memoized selector: it reads each input from the state and runs `combine` again only
 * when one of those inputs changed by reference (`Object.is`). While the inputs keep their
 * references, every call returns the same result object.
 *
 * @template State
 * @template {readonly unknown[]} Inputs
 * @template Result
 * @param {{ readonly [Index in keyof Inputs]: (state: State) => Inputs[Index] }} inputSelectors
 * @param {(...inputs: Inputs) => Result} combine
 * @returns {(state: State) => Result}
 */
export function createSelector(inputSelectors, combine) {
  const combineOnChange = memoizeLast(combine);
  return function select(state) {
    const inputs = readInputs(inputSelectors, state);
    return combineOnChange(...inputs);
  };
}

/**
 * Wraps `compute` so it runs again only when an argument changed by reference (`Object.is`).
 * Only the last arguments and result are kept, so a selector costs one comparison per argument.
 *
 * @template {readonly unknown[]} Args
 * @template Result
 * @param {(...args: Args) => Result} compute
 * @returns {(...args: Args) => Result}
 */
export function memoizeLast(compute) {
  /** @type {{ args: Args, result: Result } | null} */
  let lastCall = null;
  return function computeOnChange(...args) {
    if (lastCall !== null && haveSameItems(lastCall.args, args)) {
      return lastCall.result;
    }
    lastCall = { args, result: compute(...args) };
    return lastCall.result;
  };
}

/**
 * @template State
 * @template {readonly unknown[]} Inputs
 * @param {{ readonly [Index in keyof Inputs]: (state: State) => Inputs[Index] }} inputSelectors
 * @param {State} state
 * @returns {Inputs}
 */
function readInputs(inputSelectors, state) {
  /** @type {ReadonlyArray<(state: State) => unknown>} */
  const selectors = inputSelectors;
  const inputs = selectors.map((selectInput) => selectInput(state));
  return /** @type {Inputs} */ (/** @type {unknown} */ (inputs));
}

/**
 * @param {readonly unknown[]} previous
 * @param {readonly unknown[]} next
 */
function haveSameItems(previous, next) {
  if (previous.length !== next.length) {
    return false;
  }
  return previous.every((item, index) => Object.is(item, next[index]));
}
