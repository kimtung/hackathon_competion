import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  LineType,
  CrosshairMode,
} from "lightweight-charts";
import { subscribeTick } from "../lib/priceBus";
import {
  CANDLE_SECONDS,
  aggregateTicks,
  applyTick,
  dedupeByTime,
} from "../lib/candleAggregator";

/**
 * @typedef {{ time: number, value: number }} PricePoint
 * @typedef {{ time: number, open: number, high: number, low: number, close: number }} Candle
 */

const SYMBOLS = ["ACB", "FPT", "VCK"];
const HUD_EMPTY = "—";

// 24h rolling window for high/low. Entries older than this are discarded.
const WINDOW_SECONDS = 24 * 60 * 60;

const THEME = {
  background: "#0f0f1a",
  text: "#b8b8d0",
  grid: "#1c1c30",
  border: "#2a2a45",
  line: "#7c4dff",
  up: "#26a69a",
  down: "#ef5350",
};

/**
 * Extract ticks in chronological order from the App-provided trades array
 * (which is newest-first) filtered to the given symbol.
 *
 * Only used to seed the chart on mount / symbol change; live updates flow
 * through the tick bus to bypass React state.
 */
function seedTicksFromProps(trades, symbol) {
  const out = [];
  for (let i = trades.length - 1; i >= 0; i--) {
    const t = trades[i];
    if (t.symbol === symbol) out.push(t);
  }
  return out;
}

export default function PriceChart({ trades }) {
  const [symbol, setSymbol] = useState(SYMBOLS[0]);
  const [chartType, setChartType] = useState(/** @type {'line' | 'candles'} */ ("candles"));

  const containerRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const chartRef = useRef(/** @type {ReturnType<typeof createChart> | null} */ (null));
  const lineSeriesRef = useRef(/** @type {any} */ (null));
  const candleSeriesRef = useRef(/** @type {any} */ (null));

  // HUD DOM refs — updated directly, no React re-render per tick.
  const hudLastRef = useRef(/** @type {HTMLSpanElement | null} */ (null));
  const hudHighRef = useRef(/** @type {HTMLSpanElement | null} */ (null));
  const hudLowRef = useRef(/** @type {HTMLSpanElement | null} */ (null));

  // Live state kept out of React: current candle, last price, rolling window.
  const currentCandleRef = useRef(/** @type {Candle | null} */ (null));
  const lastPriceRef = useRef(/** @type {number | null} */ (null));
  // Ring-style history of {time, price} used to compute a rolling 24h high/low.
  const historyRef = useRef(/** @type {{ time: number, price: number }[]} */ ([]));
  const highRef = useRef(/** @type {number | null} */ (null));
  const lowRef = useRef(/** @type {number | null} */ (null));

  // RAF-throttle HUD writes so 1000 ticks/sec -> at most one DOM write per frame.
  const hudFrameRef = useRef(0);

  // Latest trades prop, read by the (re)seed effect without causing it to re-run.
  const tradesRef = useRef(trades);
  useEffect(() => {
    tradesRef.current = trades;
  });

  function renderHud() {
    const fmt = (n) => (n == null ? HUD_EMPTY : n.toLocaleString());
    if (hudLastRef.current) hudLastRef.current.textContent = fmt(lastPriceRef.current);
    if (hudHighRef.current) hudHighRef.current.textContent = fmt(highRef.current);
    if (hudLowRef.current) hudLowRef.current.textContent = fmt(lowRef.current);
  }

  // Evict entries older than the rolling window. If the current extreme falls
  // out, recompute from the remaining buffer. O(n) per eviction burst; called
  // at most once per tick and usually pops 0-1 entries.
  function evictOldHistory(nowSec) {
    const hist = historyRef.current;
    const cutoff = nowSec - WINDOW_SECONDS;
    let popped = 0;
    while (hist.length && hist[0].time < cutoff) {
      hist.shift();
      popped++;
    }
    if (popped === 0) return;
    let hi = -Infinity;
    let lo = Infinity;
    for (const p of hist) {
      if (p.price > hi) hi = p.price;
      if (p.price < lo) lo = p.price;
    }
    highRef.current = hi === -Infinity ? null : hi;
    lowRef.current = lo === Infinity ? null : lo;
  }

  // Effect 1: create chart once per mount.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight || 420,
      layout: {
        background: { type: ColorType.Solid, color: THEME.background },
        textColor: THEME.text,
        fontFamily:
          '"SF Mono", "Fira Code", "Consolas", monospace',
      },
      grid: {
        vertLines: { color: THEME.grid },
        horzLines: { color: THEME.grid },
      },
      rightPriceScale: { borderColor: THEME.border },
      timeScale: {
        borderColor: THEME.border,
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 6,
      },
      crosshair: { mode: CrosshairMode.Normal },
      autoSize: false,
    });

    const lineSeries = chart.addLineSeries({
      color: THEME.line,
      lineWidth: 2,
      lineType: LineType.Simple, // straight segments, no curve
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: THEME.up,
      downColor: THEME.down,
      borderUpColor: THEME.up,
      borderDownColor: THEME.down,
      wickUpColor: THEME.up,
      wickDownColor: THEME.down,
      priceLineVisible: false,
    });

    chartRef.current = chart;
    lineSeriesRef.current = lineSeries;
    candleSeriesRef.current = candleSeries;

    // Responsive: resize the chart to match the container box.
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        chart.applyOptions({ width, height });
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      lineSeriesRef.current = null;
      candleSeriesRef.current = null;
    };
  }, []);

  // Effect 2: toggle which series is visible without destroying state.
  useEffect(() => {
    lineSeriesRef.current?.applyOptions({ visible: chartType === "line" });
    candleSeriesRef.current?.applyOptions({ visible: chartType === "candles" });
  }, [chartType]);

  // Effect 3: (re)seed data whenever the symbol changes. Reads latest trades
  // via ref so the effect doesn't re-run on every trade update.
  useEffect(() => {
    if (!lineSeriesRef.current || !candleSeriesRef.current) return;

    const seed = seedTicksFromProps(tradesRef.current, symbol);

    const linePoints = dedupeByTime(
      seed.map((t) => ({ time: t.time, value: t.price })),
    );
    lineSeriesRef.current.setData(linePoints);

    const candles = aggregateTicks(seed, symbol);
    candleSeriesRef.current.setData(candles);

    // Rebuild rolling window + extremes from the seed.
    const hist = seed.map((t) => ({ time: t.time, price: t.price }));
    if (hist.length) {
      const cutoff = hist[hist.length - 1].time - WINDOW_SECONDS;
      while (hist.length && hist[0].time < cutoff) hist.shift();
    }
    historyRef.current = hist;

    let hi = -Infinity;
    let lo = Infinity;
    for (const p of hist) {
      if (p.price > hi) hi = p.price;
      if (p.price < lo) lo = p.price;
    }
    highRef.current = hi === -Infinity ? null : hi;
    lowRef.current = lo === Infinity ? null : lo;
    lastPriceRef.current = hist.length ? hist[hist.length - 1].price : null;
    currentCandleRef.current = candles.length ? { ...candles[candles.length - 1] } : null;

    chartRef.current?.timeScale().fitContent();
    renderHud();
  }, [symbol]);

  // Effect 4: subscribe to the live tick bus.
  useEffect(() => {
    return subscribeTick((tick) => {
      if (tick.symbol !== symbol) return;

      // 1) Line series: 1 point per tick, dedupe-by-time handled by update().
      try {
        lineSeriesRef.current?.update({ time: tick.time, value: tick.price });
      } catch {
        // Out-of-order ticks throw; drop them silently.
      }

      // 2) Candle series: fold into current 15s bucket or open a new one.
      const { candle, opened } = applyTick(currentCandleRef.current, tick);
      if (opened || candle !== currentCandleRef.current) {
        currentCandleRef.current = candle;
      }
      try {
        candleSeriesRef.current?.update(candle);
      } catch {
        /* ignore out-of-order */
      }

      // 3) Rolling window + extremes.
      historyRef.current.push({ time: tick.time, price: tick.price });
      evictOldHistory(tick.time);
      if (highRef.current == null || tick.price > highRef.current) {
        highRef.current = tick.price;
      }
      if (lowRef.current == null || tick.price < lowRef.current) {
        lowRef.current = tick.price;
      }
      lastPriceRef.current = tick.price;

      // RAF-coalesce HUD writes so 1000 ticks/sec -> <=1 DOM write per frame.
      if (!hudFrameRef.current) {
        hudFrameRef.current = requestAnimationFrame(() => {
          hudFrameRef.current = 0;
          renderHud();
        });
      }
    });
  }, [symbol]);

  // Cleanup any pending HUD frame on unmount.
  useEffect(() => {
    return () => {
      if (hudFrameRef.current) cancelAnimationFrame(hudFrameRef.current);
    };
  }, []);

  return (
    <div className="price-chart">
      <div className="chart-header">
        <h2>Price Chart</h2>
        <div className="chart-controls">
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {SYMBOLS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <div className="chart-toggle" role="tablist">
            <button
              type="button"
              className={chartType === "line" ? "active" : ""}
              onClick={() => setChartType("line")}
            >
              Line
            </button>
            <button
              type="button"
              className={chartType === "candles" ? "active" : ""}
              onClick={() => setChartType("candles")}
            >
              Candles {CANDLE_SECONDS}s
            </button>
          </div>
        </div>
      </div>

      <div className="chart-hud">
        <div className="hud-item">
          <span className="hud-label">Last</span>
          <span className="hud-value" ref={hudLastRef}>{HUD_EMPTY}</span>
        </div>
        <div className="hud-item">
          <span className="hud-label">24h High</span>
          <span className="hud-value up" ref={hudHighRef}>{HUD_EMPTY}</span>
        </div>
        <div className="hud-item">
          <span className="hud-label">24h Low</span>
          <span className="hud-value down" ref={hudLowRef}>{HUD_EMPTY}</span>
        </div>
      </div>

      <div className="chart-container" ref={containerRef} />
    </div>
  );
}
