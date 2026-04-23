/**
 * Module-level pub/sub so the chart path bypasses React state.
 * Publisher: useWebSocket calls publishTick on every trade message.
 * Subscribers: chart components that do ref-based, non-rerendering updates.
 *
 * @typedef {{ time: number, symbol: string, price: number, quantity: number }} Tick
 */

const listeners = new Set();

/** @param {Tick} tick */
export function publishTick(tick) {
  for (const fn of listeners) {
    try {
      fn(tick);
    } catch (e) {
      console.error("priceBus listener threw", e);
    }
  }
}

/**
 * @param {(tick: Tick) => void} fn
 * @returns {() => void} unsubscribe
 */
export function subscribeTick(fn) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
