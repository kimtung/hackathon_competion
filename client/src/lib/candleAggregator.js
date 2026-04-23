/**
 * @typedef {{ time: number, symbol: string, price: number, quantity: number }} Tick
 * @typedef {{ time: number, open: number, high: number, low: number, close: number }} Candle
 */

export const CANDLE_SECONDS = 15;

/** @param {number} ts @param {number} [size] */
export function bucketStart(ts, size = CANDLE_SECONDS) {
  return Math.floor(ts / size) * size;
}

/**
 * Aggregate an ordered list of ticks (oldest first) into OHLC buckets.
 * Ticks with a different symbol than `symbol` are skipped.
 *
 * @param {Tick[]} ticks
 * @param {string} symbol
 * @param {number} [size]
 * @returns {Candle[]}
 */
export function aggregateTicks(ticks, symbol, size = CANDLE_SECONDS) {
  /** @type {Candle[]} */
  const out = [];
  /** @type {Candle | null} */
  let cur = null;
  for (const t of ticks) {
    if (t.symbol !== symbol) continue;
    const b = bucketStart(t.time, size);
    if (!cur || b > cur.time) {
      if (cur) out.push(cur);
      cur = { time: b, open: t.price, high: t.price, low: t.price, close: t.price };
    } else if (b === cur.time) {
      if (t.price > cur.high) cur.high = t.price;
      if (t.price < cur.low) cur.low = t.price;
      cur.close = t.price;
    }
    // b < cur.time would be an out-of-order tick; ignore.
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Apply a single tick to the current candle. Returns the candle to push to the
 * series (either an updated existing candle or a newly-opened bucket).
 *
 * The caller owns `current` and should replace it with the returned candle.
 *
 * @param {Candle | null} current
 * @param {Tick} tick
 * @param {number} [size]
 * @returns {{ candle: Candle, opened: boolean }} — opened=true means a new bucket was started
 */
export function applyTick(current, tick, size = CANDLE_SECONDS) {
  const b = bucketStart(tick.time, size);
  if (!current || b > current.time) {
    return {
      candle: { time: b, open: tick.price, high: tick.price, low: tick.price, close: tick.price },
      opened: true,
    };
  }
  if (b < current.time) {
    // Out-of-order tick (older than current bucket). Keep current candle unchanged.
    return { candle: current, opened: false };
  }
  const high = tick.price > current.high ? tick.price : current.high;
  const low = tick.price < current.low ? tick.price : current.low;
  return {
    candle: { time: current.time, open: current.open, high, low, close: tick.price },
    opened: false,
  };
}

/**
 * Dedupe time-series points by timestamp, keeping the last value seen per time.
 * lightweight-charts requires strictly-increasing time on setData.
 *
 * @template {{ time: number }} T
 * @param {T[]} points
 * @returns {T[]}
 */
export function dedupeByTime(points) {
  /** @type {Map<number, T>} */
  const m = new Map();
  for (const p of points) m.set(p.time, p);
  return Array.from(m.values()).sort((a, b) => a.time - b.time);
}
