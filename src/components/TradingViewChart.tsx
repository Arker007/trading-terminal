import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  CandlestickSeries,
  BarSeries,
  LineSeries,
  AreaSeries,
  HistogramSeries,
  CrosshairMode,
  ColorType,
  LineStyle,
  PriceScaleMode,
  createSeriesMarkers,
  IChartApi,
  ISeriesApi,
  IPriceLine,
  SeriesType,
} from 'lightweight-charts';
import {
  Crosshair,
  Dot,
  MousePointer,
  Magnet,
  Maximize2,
  Minus,
  Plus,
  Ruler,
  Clock,
  Tag,
  Activity,
  LocateFixed,
  Eye,
  EyeOff,
  Code,
  Edit3,
  X,
  RefreshCw,
} from 'lucide-react';
import {
  ChartTheme,
  ChartType,
  CursorToolType,
  FormattedCandle,
  IndicatorSettings,
  LegendValues,
  LiveTick,
  PriceScaleModeType,
} from '../types';
import { PineExecutionResult } from '../types/pine';
import { calculateBollingerBands, calculateEMA, calculateSMA, formatPrice } from '../utils/indicators';

interface TradingViewChartProps {
  candles: FormattedCandle[];
  chartType: ChartType;
  theme: ChartTheme;
  indicators: IndicatorSettings;
  assetSymbol: string;
  currentTimeframe?: number;
  liveTick?: LiveTick | null;
  onFastTickRef?: React.MutableRefObject<((tick: LiveTick) => void) | null>;
  onLegendChange?: (values: LegendValues | null) => void;
  onResetZoomRef?: React.MutableRefObject<(() => void) | null>;
  pineResult?: PineExecutionResult | null;
  onRemovePineScript?: () => void;
  onOpenPineEditor?: () => void;
  isHistoryLoading?: boolean;
  onLoadMore?: () => void;
}

// Utility: filter and sanitize candles to strictly ensure every value is defined and numeric
function sanitizeCandles(rawCandles: FormattedCandle[]): FormattedCandle[] {
  if (!Array.isArray(rawCandles) || rawCandles.length === 0) return [];
  const valid: FormattedCandle[] = [];
  const seenTimes = new Set<number>();

  for (const c of rawCandles) {
    if (
      c &&
      typeof c.time === 'number' &&
      !isNaN(c.time) &&
      typeof c.open === 'number' &&
      !isNaN(c.open) &&
      typeof c.high === 'number' &&
      !isNaN(c.high) &&
      typeof c.low === 'number' &&
      !isNaN(c.low) &&
      typeof c.close === 'number' &&
      !isNaN(c.close)
    ) {
      if (!seenTimes.has(c.time)) {
        seenTimes.add(c.time);
        valid.push({
          time: c.time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: typeof c.volume === 'number' && !isNaN(c.volume) ? c.volume : 1,
        });
      }
    }
  }

  // Ensure strictly ascending chronological order
  valid.sort((a, b) => a.time - b.time);
  return valid;
}

export const TradingViewChart: React.FC<TradingViewChartProps> = ({
  candles: rawCandles,
  chartType,
  theme,
  indicators,
  assetSymbol,
  currentTimeframe = 60,
  liveTick,
  onFastTickRef,
  onLegendChange,
  onResetZoomRef,
  pineResult,
  onRemovePineScript,
  onOpenPineEditor,
  isHistoryLoading = false,
  onLoadMore,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const currentSeriesTypeRef = useRef<ChartType | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const smaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbUpperRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbMiddleRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbLowerRef = useRef<ISeriesApi<'Line'> | null>(null);
  const highPriceLineRef = useRef<IPriceLine | null>(null);
  const lowPriceLineRef = useRef<IPriceLine | null>(null);
  const pineSeriesRefs = useRef<ISeriesApi<'Line' | 'Histogram'>[]>([]);
  const pinePriceLinesRef = useRef<IPriceLine[]>([]);
  const pineMarkersPluginRef = useRef<any>(null);

  // Tracking refs for historical pagination jump prevention
  const lastOldestCandleTimeRef = useRef<number | null>(null);
  const lastCandlesLengthRef = useRef<number>(0);

  // TradingView state & tools
  const [activeLegend, setActiveLegend] = useState<LegendValues | null>(null);
  const [magnetMode, setMagnetMode] = useState<boolean>(false);
  const [cursorTool, setCursorTool] = useState<CursorToolType>('crosshair');
  const [priceScaleMode, setPriceScaleMode] = useState<PriceScaleModeType>('normal');
  const [isAutoScale, setIsAutoScale] = useState<boolean>(true);
  const [rulerActive, setRulerActive] = useState<boolean>(false);
  const [candleCountdown, setCandleCountdown] = useState<string>('');

  // Live on-candle tag and foreground HUD controls
  const [showOnCandlePrice, setShowOnCandlePrice] = useState<boolean>(true);
  const [showForegroundHud, setShowForegroundHud] = useState<boolean>(true);
  const [isPineVisible, setIsPineVisible] = useState<boolean>(true);
  const livePriceLineRef = useRef<IPriceLine | null>(null);

  // Direct DOM Ref for positioning floating on-candle price tag
  const floatingTagRef = useRef<HTMLDivElement>(null);

  const isDark = theme === 'dark';

  // Double-buffered RAF tick pipeline references
  const pendingTickRef = useRef<LiveTick | null>(null);
  const rafHandleRef = useRef<number | null>(null);
  const isRafScheduledRef = useRef<boolean>(false);
  const lastLegendUpdateTimeRef = useRef<number>(0);
  const lastCandleTimeRef = useRef<number>(0);
  const lastCandleDataKeyRef = useRef<string>('');
  const lastProcessedTickRef = useRef<string>('');

  // 60fps smooth easing candle interpolation state
  const animCandleRef = useRef<{
    time: number;
    open: number;
    currentClose: number;
    targetClose: number;
    high: number;
    low: number;
    volume: number;
    isAnimating: boolean;
  }>({
    time: 0,
    open: 0,
    currentClose: 0,
    targetClose: 0,
    high: 0,
    low: 0,
    volume: 1,
    isAnimating: false,
  });

  // Memoized sanitized candle dataset
  const candles = React.useMemo(() => sanitizeCandles(rawCandles), [rawCandles]);
  const candlesRef = useRef(candles);
  candlesRef.current = candles;

  const onLegendChangeRef = useRef(onLegendChange);
  onLegendChangeRef.current = onLegendChange;

  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  // Safe removal helper that catches any internal assertion or detachment errors
  const safeRemoveSeries = useCallback((series: ISeriesApi<any> | null) => {
    if (!series || !chartRef.current) return;
    try {
      chartRef.current.removeSeries(series);
    } catch {
      // Gracefully ignore error if series was already removed or detached
    }
  }, []);

  // 1. Real-time Bar Close Countdown
  useEffect(() => {
    const updateCountdown = () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const tf = Math.max(1, currentTimeframe);
      const remainder = tf - (nowSec % tf);
      const mins = Math.floor(remainder / 60);
      const secs = remainder % 60;
      setCandleCountdown(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 500);
    return () => clearInterval(timer);
  }, [currentTimeframe]);

  // Compute default legend based on the last candle in dataset
  const updateDefaultLegend = useCallback(() => {
    const dataset = candlesRef.current;
    if (!dataset || dataset.length === 0) {
      setActiveLegend(null);
      onLegendChangeRef.current?.(null);
      return;
    }
    const last = dataset[dataset.length - 1];
    const prev = dataset.length > 1 ? dataset[dataset.length - 2] : last;
    const change = last.close - prev.close;
    const changePercent = prev.close !== 0 ? (change / prev.close) * 100 : 0;
    const date = new Date(last.time * 1000);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });

    const legend: LegendValues = {
      timeStr,
      dateStr,
      open: last.open,
      high: last.high,
      low: last.low,
      close: last.close,
      change,
      changePercent,
      isUp: change >= 0,
    };
    setActiveLegend(legend);
    onLegendChangeRef.current?.(legend);
  }, []);

  // Fit content callback
  const handleFitContent = useCallback(() => {
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, []);

  // Compute screen coordinates of the active candle on canvas and update floating tag & HUD via Direct DOM manipulation
  const updateCandleCoords = useCallback(() => {
    const chart = chartRef.current;
    const series = mainSeriesRef.current;
    if (!chart || !series) return;

    const anim = animCandleRef.current;
    let targetTime = anim.time;
    let targetClose = anim.currentClose;
    let targetOpen = anim.open;
    let targetHigh = anim.high;
    let targetLow = anim.low;

    if (!targetTime || !targetClose) {
      const dataset = candlesRef.current;
      if (dataset && dataset.length > 0) {
        const last = dataset[dataset.length - 1];
        targetTime = last.time;
        targetClose = last.close;
        targetOpen = last.open;
        targetHigh = last.high;
        targetLow = last.low;
      } else {
        if (floatingTagRef.current) floatingTagRef.current.style.display = 'none';
        return;
      }
    }

    try {
      const x = chart.timeScale().timeToCoordinate(targetTime as any);
      const y = series.priceToCoordinate(targetClose);

      const tagEl = floatingTagRef.current;

      if (tagEl) {
        if (x === null || y === null || isNaN(x) || isNaN(y)) {
          tagEl.style.display = 'none';
        } else {
          const containerWidth = containerRef.current?.clientWidth || 800;
          const containerHeight = containerRef.current?.clientHeight || 500;
          const isVisible = x >= 10 && x <= containerWidth - 45 && y >= 10 && y <= containerHeight - 20;

          if (!isVisible) {
            tagEl.style.display = 'none';
          } else {
            tagEl.style.display = 'flex';
            tagEl.style.transform = `translate3d(${x}px, ${y}px, 0) translate(10px, -50%)`;
          }
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const hasScrolledToLiveRef = useRef<boolean>(false);

  // Focus chart viewport on the latest live candle side
  const scrollToLiveCandles = useCallback(() => {
    const chart = chartRef.current;
    const dataset = candlesRef.current;
    if (!chart || !dataset || dataset.length === 0) return;
    try {
      const timeScale = chart.timeScale();
      const total = dataset.length;
      timeScale.setVisibleLogicalRange({
        from: Math.max(0, total - 65),
        to: total + 12,
      });
      timeScale.scrollToRealTime();
      hasScrolledToLiveRef.current = true;
    } catch {
      chartRef.current?.timeScale().scrollToRealTime();
    }
  }, []);

  // Center chart camera on the active live candle without squeezing all history
  const handleCenterLiveCandle = useCallback(() => {
    scrollToLiveCandles();
    setTimeout(updateCandleCoords, 50);
  }, [scrollToLiveCandles, updateCandleCoords]);

  // Zoom helpers
  const handleZoomIn = () => {
    if (!chartRef.current) return;
    const timeScale = chartRef.current.timeScale();
    const range = timeScale.getVisibleLogicalRange();
    if (range) {
      const delta = (range.to - range.from) * 0.25;
      timeScale.setVisibleLogicalRange({
        from: range.from + delta,
        to: range.to,
      });
    }
  };

  const handleZoomOut = () => {
    if (!chartRef.current) return;
    const timeScale = chartRef.current.timeScale();
    const range = timeScale.getVisibleLogicalRange();
    if (range) {
      const delta = (range.to - range.from) * 0.35;
      timeScale.setVisibleLogicalRange({
        from: range.from - delta,
        to: range.to,
      });
    }
  };

  // Quick Time Range Selector
  const handleSetQuickRange = (rangeType: '15m' | '1h' | '4h' | '12h' | '1D' | 'All') => {
    if (!chartRef.current || candles.length === 0) return;
    const timeScale = chartRef.current.timeScale();

    if (rangeType === 'All') {
      timeScale.fitContent();
      return;
    }

    const last = candles[candles.length - 1];
    const toTime = last.time;
    let secondsBack = 3600;

    switch (rangeType) {
      case '15m':
        secondsBack = 15 * 60;
        break;
      case '1h':
        secondsBack = 60 * 60;
        break;
      case '4h':
        secondsBack = 4 * 3600;
        break;
      case '12h':
        secondsBack = 12 * 3600;
        break;
      case '1D':
        secondsBack = 24 * 3600;
        break;
    }

    const fromTime = toTime - secondsBack;
    timeScale.setVisibleRange({
      from: fromTime as any,
      to: (toTime + currentTimeframe * 2) as any,
    });
  };

  // Expose reset zoom to parent
  useEffect(() => {
    if (onResetZoomRef) {
      onResetZoomRef.current = handleFitContent;
    }
  }, [onResetZoomRef, handleFitContent]);

  // 1. Initialize TradingView Chart Instance
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;

    const chart = createChart(container, {
      width,
      height,
      layout: {
        background: {
          type: ColorType.Solid,
          color: isDark ? '#131722' : '#ffffff',
        },
        textColor: isDark ? '#d1d4dc' : '#1e222d',
        fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
        fontSize: 12,
      },
      grid: {
        vertLines: {
          color: isDark ? 'rgba(42, 46, 57, 0.6)' : 'rgba(240, 243, 250, 0.85)',
          style: LineStyle.Dotted,
        },
        horzLines: {
          color: isDark ? 'rgba(42, 46, 57, 0.6)' : 'rgba(240, 243, 250, 0.85)',
          style: LineStyle.Dotted,
        },
      },
      crosshair: {
        mode: magnetMode ? CrosshairMode.Magnet : CrosshairMode.Normal,
        vertLine: {
          width: 1,
          color: isDark ? '#758696' : '#9598a1',
          style: LineStyle.Dashed,
          labelBackgroundColor: isDark ? '#2a2e39' : '#4a5260',
        },
        horzLine: {
          width: 1,
          color: isDark ? '#758696' : '#9598a1',
          style: LineStyle.Dashed,
          labelBackgroundColor: isDark ? '#2a2e39' : '#4a5260',
        },
      },
      rightPriceScale: {
        borderColor: isDark ? '#2a2e39' : '#e0e3eb',
        autoScale: true,
        alignLabels: true,
        borderVisible: true,
        scaleMargins: {
          top: 0.08,
          bottom: 0.18,
        },
      },
      timeScale: {
        borderColor: isDark ? '#2a2e39' : '#e0e3eb',
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 12,
        barSpacing: 14,
        minBarSpacing: 0.5,
        shiftVisibleRangeOnNewBar: true,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: {
          time: true,
          price: true,
        },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
    });

    chartRef.current = chart;

    // Clear series refs when new chart is instantiated
    mainSeriesRef.current = null;
    currentSeriesTypeRef.current = null;
    volumeSeriesRef.current = null;
    smaSeriesRef.current = null;
    emaSeriesRef.current = null;
    bbUpperRef.current = null;
    bbMiddleRef.current = null;
    bbLowerRef.current = null;
    highPriceLineRef.current = null;
    lowPriceLineRef.current = null;

    // Resize Observer for dynamic responsive sizing
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0 || !chartRef.current) return;
      const { width: newWidth, height: newHeight } = entries[0].contentRect;
      if (newWidth > 0 && newHeight > 0) {
        chartRef.current.applyOptions({ width: newWidth, height: newHeight });
        if (!hasScrolledToLiveRef.current) {
          scrollToLiveCandles();
        }
        updateCandleCoords();
      }
    });

    resizeObserver.observe(container);

    // Subscribe to range and scroll changes to update floating candle tags smoothly and trigger historical pagination
    const handleLogicalRangeChange = (newRange: any) => {
      updateCandleCoords();
      if (!newRange) return;
      if (newRange.from < 15) {
        onLoadMoreRef.current?.();
      }
    };

    const handleTimeRangeChange = () => {
      updateCandleCoords();
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(handleLogicalRangeChange);
    chart.timeScale().subscribeVisibleTimeRangeChange(handleTimeRangeChange);

    return () => {
      try {
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleLogicalRangeChange);
        chart.timeScale().unsubscribeVisibleTimeRangeChange(handleTimeRangeChange);
      } catch {}
      resizeObserver.disconnect();
      if (rafHandleRef.current) {
        cancelAnimationFrame(rafHandleRef.current);
      }
      mainSeriesRef.current = null;
      currentSeriesTypeRef.current = null;
      volumeSeriesRef.current = null;
      smaSeriesRef.current = null;
      emaSeriesRef.current = null;
      bbUpperRef.current = null;
      bbMiddleRef.current = null;
      bbLowerRef.current = null;
      highPriceLineRef.current = null;
      lowPriceLineRef.current = null;
      livePriceLineRef.current = null;
      try {
        chart.remove();
      } catch {
        // ignore
      }
      chartRef.current = null;
    };
  }, [isDark]); // Re-create ONLY when dark/light mode structural theme switches

  // Update Crosshair Mode dynamically when Magnet is toggled
  useEffect(() => {
    if (!chartRef.current) return;
    try {
      chartRef.current.applyOptions({
        crosshair: {
          mode: magnetMode ? CrosshairMode.Magnet : CrosshairMode.Normal,
        },
      });
    } catch {}
  }, [magnetMode]);

  // Update Price Scale Mode dynamically (Normal / Log / Percentage)
  useEffect(() => {
    if (!chartRef.current) return;
    try {
      chartRef.current.priceScale('right').applyOptions({
        mode:
          priceScaleMode === 'logarithmic'
            ? PriceScaleMode.Logarithmic
            : priceScaleMode === 'percentage'
            ? PriceScaleMode.Percentage
            : PriceScaleMode.Normal,
        autoScale: isAutoScale,
      });
    } catch {}
  }, [priceScaleMode, isAutoScale]);

  // 2. Setup or Re-create Main Series ONLY when chartType or chart instance changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // If main series already exists and chartType has not changed, keep it
    if (mainSeriesRef.current && currentSeriesTypeRef.current === chartType) {
      return;
    }

    // Safely remove previous series & clear price lines
    if (mainSeriesRef.current) {
      if (livePriceLineRef.current) {
        try {
          mainSeriesRef.current.removePriceLine(livePriceLineRef.current);
        } catch {}
        livePriceLineRef.current = null;
      }
      if (highPriceLineRef.current) {
        try {
          mainSeriesRef.current.removePriceLine(highPriceLineRef.current);
        } catch {}
        highPriceLineRef.current = null;
      }
      if (lowPriceLineRef.current) {
        try {
          mainSeriesRef.current.removePriceLine(lowPriceLineRef.current);
        } catch {}
        lowPriceLineRef.current = null;
      }
      safeRemoveSeries(mainSeriesRef.current);
      mainSeriesRef.current = null;
    }

    const priceFormatConfig = {
      type: 'price' as const,
      precision: 8,
      minMove: 0.00000001,
    };

    let newSeries: ISeriesApi<SeriesType>;

    if (chartType === 'candlestick') {
      newSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#089981',
        downColor: '#f23645',
        wickUpColor: '#089981',
        wickDownColor: '#f23645',
        borderVisible: false,
        priceFormat: priceFormatConfig,
        priceLineVisible: true,
        priceLineWidth: 1,
        priceLineStyle: LineStyle.Dashed,
        lastValueVisible: true,
      });
    } else if (chartType === 'hollow') {
      newSeries = chart.addSeries(CandlestickSeries, {
        upColor: 'rgba(0,0,0,0)',
        borderUpColor: '#089981',
        downColor: '#f23645',
        borderDownColor: '#f23645',
        wickUpColor: '#089981',
        wickDownColor: '#f23645',
        borderVisible: true,
        priceFormat: priceFormatConfig,
        priceLineVisible: true,
        priceLineWidth: 1,
        priceLineStyle: LineStyle.Dashed,
        lastValueVisible: true,
      });
    } else if (chartType === 'bar') {
      newSeries = chart.addSeries(BarSeries, {
        upColor: '#089981',
        downColor: '#f23645',
        priceFormat: priceFormatConfig,
        priceLineVisible: true,
        priceLineWidth: 1,
        priceLineStyle: LineStyle.Dashed,
        lastValueVisible: true,
      });
    } else if (chartType === 'area') {
      newSeries = chart.addSeries(AreaSeries, {
        topColor: isDark ? 'rgba(41, 98, 255, 0.4)' : 'rgba(41, 98, 255, 0.28)',
        bottomColor: 'rgba(41, 98, 255, 0.0)',
        lineColor: '#2962ff',
        lineWidth: 2,
        priceFormat: priceFormatConfig,
        priceLineVisible: true,
        priceLineWidth: 1,
        priceLineStyle: LineStyle.Dashed,
        lastValueVisible: true,
      });
    } else {
      newSeries = chart.addSeries(LineSeries, {
        color: '#2962ff',
        lineWidth: 2,
        priceFormat: priceFormatConfig,
        priceLineVisible: true,
        priceLineWidth: 1,
        priceLineStyle: LineStyle.Dashed,
        lastValueVisible: true,
      });
    }

    mainSeriesRef.current = newSeries;
    currentSeriesTypeRef.current = chartType;

    // Populate data if candles exist
    if (candles && candles.length > 0) {
      try {
        if (chartType === 'line' || chartType === 'area') {
          const lineData = candles.map((c) => ({
            time: c.time as any,
            value: c.close,
          }));
          (newSeries as ISeriesApi<'Line' | 'Area'>).setData(lineData);
        } else {
          const ohlcData = candles.map((c) => ({
            time: c.time as any,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }));
          (newSeries as ISeriesApi<'Candlestick' | 'Bar'>).setData(ohlcData);
        }
        lastCandleTimeRef.current = candles[candles.length - 1].time;
        scrollToLiveCandles();
        setTimeout(scrollToLiveCandles, 50);
        setTimeout(scrollToLiveCandles, 250);
      } catch (err) {
        console.warn('Error setting main series data:', err);
      }
    }

    // Subscribe to crosshair move
    const crosshairHandler = (param: any) => {
      if (!param.time || !param.seriesData || !mainSeriesRef.current) {
        updateDefaultLegend();
        return;
      }

      const dataPoint = param.seriesData.get(mainSeriesRef.current);
      if (!dataPoint) {
        updateDefaultLegend();
        return;
      }

      let openVal = 0;
      let highVal = 0;
      let lowVal = 0;
      let closeVal = 0;

      if ('close' in dataPoint && 'open' in dataPoint) {
        openVal = dataPoint.open;
        highVal = dataPoint.high;
        lowVal = dataPoint.low;
        closeVal = dataPoint.close;
      } else if ('value' in dataPoint) {
        openVal = dataPoint.value;
        highVal = dataPoint.value;
        lowVal = dataPoint.value;
        closeVal = dataPoint.value;
      }

      const change = closeVal - openVal;
      const changePercent = openVal !== 0 ? (change / openVal) * 100 : 0;
      const date = new Date(Number(param.time) * 1000);
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const dateStr = date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });

      const legend: LegendValues = {
        timeStr,
        dateStr,
        open: openVal,
        high: highVal,
        low: lowVal,
        close: closeVal,
        change,
        changePercent,
        isUp: change >= 0,
      };

      setActiveLegend(legend);
      onLegendChangeRef.current?.(legend);
    };

    chart.subscribeCrosshairMove(crosshairHandler);

    return () => {
      try {
        chart.unsubscribeCrosshairMove(crosshairHandler);
      } catch {}
    };
  }, [chartType, isDark, safeRemoveSeries, updateDefaultLegend]);

  // 3. Update main series data whenever candles change without destroying the series or losing user zoom
  useEffect(() => {
    const series = mainSeriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart || !candles || candles.length === 0) return;

    // Prevent redundant setData if the historical candle set has not changed
    const dataKey = `${chartType}_${candles.length}_${candles[0]?.time}_${candles[candles.length - 1]?.time}`;
    if (lastCandleDataKeyRef.current === dataKey) {
      return;
    }
    lastCandleDataKeyRef.current = dataKey;

    try {
      const previousRange = chart.timeScale().getVisibleLogicalRange();
      const oldOldestTime = lastOldestCandleTimeRef.current;

      // Update tracking refs
      lastOldestCandleTimeRef.current = candles[0]?.time || null;
      lastCandlesLengthRef.current = candles.length;

      if (chartType === 'line' || chartType === 'area') {
        const lineData = candles.map((c) => ({
          time: c.time as any,
          value: c.close,
        }));
        (series as ISeriesApi<'Line' | 'Area'>).setData(lineData);
      } else {
        const ohlcData = candles.map((c) => ({
          time: c.time as any,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));
        (series as ISeriesApi<'Candlestick' | 'Bar'>).setData(ohlcData);
      }
      const last = candles[candles.length - 1];
      lastCandleTimeRef.current = last.time;
      animCandleRef.current = {
        time: last.time,
        open: last.open,
        currentClose: last.close,
        targetClose: last.close,
        high: last.high,
        low: last.low,
        volume: last.volume || 1,
        isAnimating: false,
      };

      if (!hasScrolledToLiveRef.current) {
        scrollToLiveCandles();
        setTimeout(scrollToLiveCandles, 100);
      } else if (previousRange && oldOldestTime !== null && candles[0].time < oldOldestTime) {
        // Prevent scroll jump when loading older historical candles
        const prependedCount = candles.findIndex((c) => c.time === oldOldestTime);
        if (prependedCount > 0) {
          chart.timeScale().setVisibleLogicalRange({
            from: previousRange.from + prependedCount,
            to: previousRange.to + prependedCount,
          });
        } else {
          chart.timeScale().setVisibleLogicalRange(previousRange);
        }
      } else if (previousRange && previousRange.to > 15) {
        chart.timeScale().setVisibleLogicalRange(previousRange);
      } else {
        scrollToLiveCandles();
      }
    } catch (err) {
      console.warn('Error updating candle data:', err);
    }
  }, [candles, chartType, scrollToLiveCandles]);

  // Synchronize animCandleRef whenever timeframe changes
  useEffect(() => {
    hasScrolledToLiveRef.current = false;
    lastOldestCandleTimeRef.current = null;
    if (rafHandleRef.current) {
      cancelAnimationFrame(rafHandleRef.current);
      rafHandleRef.current = null;
    }
    if (candles && candles.length > 0) {
      const last = candles[candles.length - 1];
      animCandleRef.current = {
        time: last.time,
        open: last.open,
        currentClose: last.close,
        targetClose: last.close,
        high: last.high,
        low: last.low,
        volume: last.volume || 1,
        isAnimating: false,
      };
      lastCandleTimeRef.current = last.time;
    } else {
      animCandleRef.current = {
        time: 0,
        open: 0,
        currentClose: 0,
        targetClose: 0,
        high: 0,
        low: 0,
        volume: 1,
        isAnimating: false,
      };
      lastCandleTimeRef.current = 0;
    }
  }, [currentTimeframe]);

  // 4. Setup Volume Pane using official lightweight-charts overlay pattern (priceScaleId: '')
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (!indicators.showVolume) {
      if (volumeSeriesRef.current) {
        safeRemoveSeries(volumeSeriesRef.current);
        volumeSeriesRef.current = null;
      }
      return;
    }

    if (!volumeSeriesRef.current) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: {
          type: 'volume',
        },
        priceScaleId: '', // Overlay scale in official lightweight-charts
      });

      try {
        volumeSeries.priceScale().applyOptions({
          scaleMargins: {
            top: 0.82,
            bottom: 0,
          },
        });
      } catch {}

      volumeSeriesRef.current = volumeSeries;
    }

    if (volumeSeriesRef.current && candles && candles.length > 0) {
      const volumeData = candles.map((c) => ({
        time: c.time as any,
        value: typeof c.volume === 'number' && !isNaN(c.volume) ? c.volume : 1,
        color:
          c.close >= c.open
            ? isDark
              ? 'rgba(8, 153, 129, 0.45)'
              : 'rgba(8, 153, 129, 0.35)'
            : isDark
            ? 'rgba(242, 54, 69, 0.45)'
            : 'rgba(242, 54, 69, 0.35)',
      }));

      try {
        volumeSeriesRef.current.setData(volumeData);
      } catch (err) {
        console.warn('Error setting volume data:', err);
      }
    }
  }, [indicators.showVolume, candles, isDark, safeRemoveSeries]);

  // 5. Setup Technical Overlays (SMA 20, EMA 50, Bollinger Bands)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // Clear previous indicator lines safely
    safeRemoveSeries(smaSeriesRef.current);
    smaSeriesRef.current = null;
    safeRemoveSeries(emaSeriesRef.current);
    emaSeriesRef.current = null;
    safeRemoveSeries(bbUpperRef.current);
    bbUpperRef.current = null;
    safeRemoveSeries(bbMiddleRef.current);
    bbMiddleRef.current = null;
    safeRemoveSeries(bbLowerRef.current);
    bbLowerRef.current = null;

    if (!candles || candles.length === 0) return;

    // SMA 20
    if (indicators.showSma20) {
      const smaData = calculateSMA(candles, 20).filter((pt) => typeof pt.value === 'number' && !isNaN(pt.value));
      if (smaData.length > 0) {
        const smaSeries = chart.addSeries(LineSeries, {
          color: '#f59e0b',
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          title: 'SMA 20',
        });
        smaSeries.setData(smaData as any);
        smaSeriesRef.current = smaSeries;
      }
    }

    // EMA 50
    if (indicators.showEma50) {
      const emaData = calculateEMA(candles, 50).filter((pt) => typeof pt.value === 'number' && !isNaN(pt.value));
      if (emaData.length > 0) {
        const emaSeries = chart.addSeries(LineSeries, {
          color: '#3b82f6',
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          title: 'EMA 50',
        });
        emaSeries.setData(emaData as any);
        emaSeriesRef.current = emaSeries;
      }
    }

    // Bollinger Bands (20, 2)
    if (indicators.showBollingerBands) {
      const { upper, middle, lower } = calculateBollingerBands(candles, 20, 2);
      const upperClean = upper.filter((pt) => typeof pt.value === 'number' && !isNaN(pt.value));
      const middleClean = middle.filter((pt) => typeof pt.value === 'number' && !isNaN(pt.value));
      const lowerClean = lower.filter((pt) => typeof pt.value === 'number' && !isNaN(pt.value));

      if (upperClean.length > 0) {
        const upperSeries = chart.addSeries(LineSeries, {
          color: 'rgba(168, 85, 247, 0.85)',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        upperSeries.setData(upperClean as any);
        bbUpperRef.current = upperSeries;

        const middleSeries = chart.addSeries(LineSeries, {
          color: 'rgba(168, 85, 247, 0.5)',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        middleSeries.setData(middleClean as any);
        bbMiddleRef.current = middleSeries;

        const lowerSeries = chart.addSeries(LineSeries, {
          color: 'rgba(168, 85, 247, 0.85)',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        lowerSeries.setData(lowerClean as any);
        bbLowerRef.current = lowerSeries;
      }
    }
  }, [indicators.showSma20, indicators.showEma50, indicators.showBollingerBands, candles, safeRemoveSeries]);

  // 6. Session High / Low Price Lines
  useEffect(() => {
    const mainSeries = mainSeriesRef.current;
    if (!mainSeries) return;

    if (highPriceLineRef.current) {
      try {
        mainSeries.removePriceLine(highPriceLineRef.current);
      } catch {}
      highPriceLineRef.current = null;
    }
    if (lowPriceLineRef.current) {
      try {
        mainSeries.removePriceLine(lowPriceLineRef.current);
      } catch {}
      lowPriceLineRef.current = null;
    }

    if (indicators.showHighLowLevels && candles && candles.length > 0) {
      const highestPrice = Math.max(...candles.map((c) => c.high));
      const lowestPrice = Math.min(...candles.map((c) => c.low));

      if (!isNaN(highestPrice) && !isNaN(lowestPrice)) {
        highPriceLineRef.current = mainSeries.createPriceLine({
          price: highestPrice,
          color: '#089981',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: 'SESSION HIGH',
        });

        lowPriceLineRef.current = mainSeries.createPriceLine({
          price: lowestPrice,
          color: '#f23645',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: 'SESSION LOW',
        });
      }
    }
  }, [indicators.showHighLowLevels, candles]);

  // 6.1 Pine Script Plots & Indicators Overlay Engine
  useEffect(() => {
    const chart = chartRef.current;
    const mainSeries = mainSeriesRef.current;
    if (!chart) return;

    // Clean up previous Pine series
    for (const s of pineSeriesRefs.current) {
      safeRemoveSeries(s);
    }
    pineSeriesRefs.current = [];

    // Clean up previous Pine horizontal lines
    if (mainSeries) {
      for (const pl of pinePriceLinesRef.current) {
        try {
          mainSeries.removePriceLine(pl);
        } catch {}
      }
    }
    pinePriceLinesRef.current = [];

    // Clean up previous Pine markers plugin safely using detachPrimitive
    if (pineMarkersPluginRef.current && mainSeries) {
      try {
        mainSeries.detachPrimitive(pineMarkersPluginRef.current);
      } catch {}
      pineMarkersPluginRef.current = null;
    }

    if (!pineResult || !pineResult.success || !isPineVisible || !candles || candles.length === 0) {
      if (pineResult) {
        console.log('[PineScript Flow] 3. TradingViewChart skipped rendering (success=' + pineResult?.success + ', isPineVisible=' + isPineVisible + ', candles=' + candles?.length + ')');
      }
      return;
    }

    try {
      console.group('[PineScript Flow] 3. Rendering Pine Script Overlays on Lightweight Charts Canvas');
      console.log('[PineScript Flow] Active script target:', {
        scriptName: pineResult.scriptName,
        scriptType: pineResult.scriptType,
        isOverlay: pineResult.isOverlay,
        plotsCount: pineResult.plots?.length || 0,
        hlinesCount: pineResult.hlines?.length || 0,
        markersCount: pineResult.markers?.length || 0,
      });

      const isOverlay = pineResult.isOverlay !== false;

      // Configure Left vs Right Price Scales for non-overlay (e.g. RSI, MACD) vs overlay indicators
      if (!isOverlay) {
        try {
          chart.priceScale('left').applyOptions({
            visible: true,
            scaleMargins: { top: 0.70, bottom: 0.02 },
          });
          chart.priceScale('right').applyOptions({
            scaleMargins: { top: 0.05, bottom: 0.35 },
          });
        } catch {}
      } else {
        try {
          chart.priceScale('left').applyOptions({
            visible: false,
          });
          chart.priceScale('right').applyOptions({
            scaleMargins: { top: 0.08, bottom: 0.18 },
          });
        } catch {}
      }

      // 1. Render Plotted Series
      if (pineResult.plots && pineResult.plots.length > 0) {
        for (const plot of pineResult.plots) {
          if (!plot.data || plot.data.length === 0) continue;

          // Filter, sort and deduplicate timestamps to ensure lightweight-charts invariant holds
          const sortedRaw = [...plot.data]
            .filter((pt) => typeof pt.time === 'number' && typeof pt.value === 'number' && !isNaN(pt.value))
            .sort((a, b) => a.time - b.time);

          if (sortedRaw.length === 0) continue;

          const cleanData: { time: any; value: number }[] = [];
          let lastT: number | null = null;
          for (const pt of sortedRaw) {
            if (pt.time !== lastT) {
              cleanData.push({ time: pt.time as any, value: pt.value });
              lastT = pt.time;
            }
          }

          if (cleanData.length === 0) continue;

          const priceScaleId = isOverlay ? 'right' : 'left';

          if (plot.style === 'histogram' || (plot.style as any) === 'columns') {
            const series = chart.addSeries(HistogramSeries, {
              color: plot.color || '#3b82f6',
              priceLineVisible: false,
              lastValueVisible: true,
              title: plot.title,
              priceScaleId,
            });
            series.setData(cleanData as any);
            pineSeriesRefs.current.push(series);
          } else {
            const series = chart.addSeries(LineSeries, {
              color: plot.color || '#3b82f6',
              lineWidth: (plot.lineWidth as any) || 2,
              priceLineVisible: false,
              lastValueVisible: true,
              title: plot.title,
              priceScaleId,
            });
            series.setData(cleanData as any);
            pineSeriesRefs.current.push(series);
          }
        }
      }

      // 2. Render Horizontal Reference Lines (hlines)
      if (mainSeries && pineResult.hlines && pineResult.hlines.length > 0) {
        for (const hl of pineResult.hlines) {
          if (typeof hl.price === 'number' && !isNaN(hl.price)) {
            const pl = mainSeries.createPriceLine({
              price: hl.price,
              color: hl.color || '#848e9c',
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: hl.title,
            });
            pinePriceLinesRef.current.push(pl);
          }
        }
      }

      // 3. Render Pine Markers (Strategy Buy/Sell, Triangles, Signal Labels)
      if (mainSeries && pineResult.markers && pineResult.markers.length > 0) {
        const cleanMarkers = pineResult.markers
          .filter((m) => typeof m.time === 'number' && !isNaN(m.time))
          .sort((a, b) => a.time - b.time)
          .map((m) => {
            const text = (m.text || '').replace(/[⇧⇩↑↓▲▼⇪]/g, '').trim();
            return {
              time: m.time as any,
              position: m.position || 'aboveBar',
              color: m.color || (m.position === 'belowBar' ? '#22c55e' : '#ef4444'),
              shape: m.shape || (m.position === 'belowBar' ? 'arrowUp' : 'arrowDown'),
              text,
              size: m.size || 1,
            };
          });

        if (cleanMarkers.length > 0) {
          pineMarkersPluginRef.current = createSeriesMarkers(mainSeries, cleanMarkers);
          console.log('[PineScript Flow] Created series markers plugin with ' + cleanMarkers.length + ' markers');
        }
      }

      console.log('[PineScript Flow] Successfully rendered on chart canvas:', {
        renderedSeries: pineSeriesRefs.current.length,
        renderedPriceLines: pinePriceLinesRef.current.length,
        markersAttached: !!pineMarkersPluginRef.current,
      });
      console.groupEnd();
    } catch (err) {
      console.warn('[PineScript Flow] Error rendering Pine Script overlays:', err);
      console.groupEnd();
    }
  }, [pineResult, isPineVisible, candles, safeRemoveSeries]);

  // 7. Optimal Double-Buffered RAF Real-Time Tick Dispatcher with Full Value Validation
  const commitTickToCanvas = useCallback(
    (tick: LiveTick) => {
      if (!mainSeriesRef.current || !chartRef.current) return;
      if (!tick || typeof tick.time !== 'number' || isNaN(tick.time)) return;
      if (typeof tick.close !== 'number' || isNaN(tick.close)) return;

      // Strictly guard against backwards timestamps (prevents "Cannot update oldest data")
      if (lastCandleTimeRef.current && tick.time < lastCandleTimeRef.current) {
        return;
      }

      // Outlier protection against canvas corruption
      const baseline = animCandleRef.current.targetClose > 0 ? animCandleRef.current.targetClose : (candlesRef.current[candlesRef.current.length - 1]?.close || 0);
      if (baseline > 0 && Math.abs(tick.close - baseline) / baseline > 0.02) {
        return;
      }

      lastCandleTimeRef.current = Math.max(lastCandleTimeRef.current, tick.time);

      const tickTime = tick.time as any;
      const openVal = typeof tick.open === 'number' && !isNaN(tick.open) ? tick.open : tick.close;
      const highVal = typeof tick.high === 'number' && !isNaN(tick.high) ? tick.high : tick.close;
      const lowVal = typeof tick.low === 'number' && !isNaN(tick.low) ? tick.low : tick.close;
      const closeVal = tick.close;
      const volumeVal = typeof tick.volume === 'number' && !isNaN(tick.volume) ? tick.volume : 1;

      try {
        // Update main series directly on GPU canvas
        if (chartType === 'line' || chartType === 'area') {
          (mainSeriesRef.current as ISeriesApi<'Line' | 'Area'>).update({
            time: tickTime,
            value: closeVal,
          });
        } else {
          (mainSeriesRef.current as ISeriesApi<'Candlestick' | 'Bar'>).update({
            time: tickTime,
            open: openVal,
            high: highVal,
            low: lowVal,
            close: closeVal,
          });
        }
      } catch (err: any) {
        if (err?.message?.includes?.('Cannot update oldest data')) {
          return;
        }
        console.warn('Canvas main series update failed:', err);
      }

      // Update volume series if active
      if (volumeSeriesRef.current) {
        try {
          volumeSeriesRef.current.update({
            time: tickTime,
            value: volumeVal,
            color:
              closeVal >= openVal
                ? isDark
                  ? 'rgba(8, 153, 129, 0.45)'
                  : 'rgba(8, 153, 129, 0.35)'
                : isDark
                ? 'rgba(242, 54, 69, 0.45)'
                : 'rgba(242, 54, 69, 0.35)',
          });
        } catch {}
      }

      // Update session high/low price lines if new extreme reached
      if (indicators.showHighLowLevels) {
        try {
          if (highPriceLineRef.current && highVal > highPriceLineRef.current.options().price) {
            highPriceLineRef.current.applyOptions({ price: highVal });
          }
          if (lowPriceLineRef.current && lowVal < lowPriceLineRef.current.options().price) {
            lowPriceLineRef.current.applyOptions({ price: lowVal });
          }
        } catch {}
      }

      // Update screen coordinates for on-candle price pill and foreground HUD
      updateCandleCoords();

      // Update Legend DOM values throttled to ~30fps to avoid DOM reflow overhead
      const now = Date.now();
      if (now - lastLegendUpdateTimeRef.current >= 33) {
        lastLegendUpdateTimeRef.current = now;
        const change = closeVal - openVal;
        const changePercent = openVal !== 0 ? (change / openVal) * 100 : 0;
        const date = new Date(tick.time * 1000);
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const dateStr = date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });

        const updatedLegend: LegendValues = {
          timeStr,
          dateStr,
          open: openVal,
          high: highVal,
          low: lowVal,
          close: closeVal,
          change,
          changePercent,
          isUp: change >= 0,
        };
        setActiveLegend(updatedLegend);
        onLegendChangeRef.current?.(updatedLegend);
      }
    },
    [chartType, indicators.showHighLowLevels, isDark]
  );

  // 60 FPS Fluid Continuous Easing Real-Time Tick Dispatcher
  const scheduleTick = useCallback(
    (tick: LiveTick) => {
      if (!tick || typeof tick.time !== 'number' || isNaN(tick.time)) return;
      if (typeof tick.close !== 'number' || isNaN(tick.close)) return;

      const anim = animCandleRef.current;

      // Price Sanity Shield: reject rogue ticks that jump by > 2% from current candle baseline
      const baselinePrice = anim.targetClose > 0 ? anim.targetClose : (candlesRef.current[candlesRef.current.length - 1]?.close || 0);
      if (baselinePrice > 0 && Math.abs(tick.close - baselinePrice) / baselinePrice > 0.02) {
        console.warn('[TradingViewChart] Suppressed anomalous outlier tick:', tick.close, 'vs baseline:', baselinePrice);
        return;
      }

      const tickKey = `${tick.time}_${tick.close}_${tick.tickIndex || 0}_${tick.serverTimestamp || 0}`;
      lastProcessedTickRef.current = tickKey;

      if (anim.time > 0 && tick.time < anim.time) {
        return; // Ignore stale or older ticks from previous intervals
      }

      const isNew = tick.isNewCandle || tick.time > anim.time || anim.time === 0;

      if (isNew) {
        anim.time = tick.time;
        anim.open = typeof tick.open === 'number' && !isNaN(tick.open) ? tick.open : tick.close;
        anim.currentClose = anim.open;
        anim.targetClose = tick.close;
        anim.high = Math.max(anim.open, tick.high, tick.close);
        anim.low = Math.min(anim.open, tick.low, tick.close);
        anim.volume = tick.volume || 1;
        lastCandleTimeRef.current = tick.time;

        commitTickToCanvas({
          time: anim.time,
          open: anim.open,
          high: anim.high,
          low: anim.low,
          close: anim.currentClose,
          volume: anim.volume,
          created_at: tick.created_at,
          isNewCandle: true,
          tickIndex: tick.tickIndex,
          serverTimestamp: tick.serverTimestamp,
        });
      } else {
        anim.targetClose = tick.close;
        if (typeof tick.open === 'number' && !isNaN(tick.open)) {
          anim.open = tick.open;
        }
        anim.high = Math.max(anim.high, tick.high, tick.close);
        anim.low = Math.min(anim.low, tick.low, tick.close);
        anim.volume = Math.max(anim.volume, tick.volume || 1);
      }

      if (!anim.isAnimating) {
        anim.isAnimating = true;

        const animateStep = () => {
          if (!mainSeriesRef.current || !chartRef.current) {
            anim.isAnimating = false;
            return;
          }

          const diff = anim.targetClose - anim.currentClose;

          // Smooth exponential easing factor: 0.22 per frame gives fluid ~180ms transition
          if (Math.abs(diff) > 1e-12) {
            anim.currentClose += diff * 0.22;
          } else {
            anim.currentClose = anim.targetClose;
          }

          const currentHigh = Math.max(anim.high, anim.currentClose);
          const currentLow = Math.min(anim.low, anim.currentClose);
          anim.high = currentHigh;
          anim.low = currentLow;

          commitTickToCanvas({
            time: anim.time,
            open: anim.open,
            high: currentHigh,
            low: currentLow,
            close: anim.currentClose,
            volume: anim.volume,
            created_at: new Date(anim.time * 1000).toISOString(),
            isNewCandle: false,
            tickIndex: 0,
            serverTimestamp: Date.now(),
          });

          if (Math.abs(anim.targetClose - anim.currentClose) > 1e-12) {
            rafHandleRef.current = requestAnimationFrame(animateStep);
          } else {
            anim.isAnimating = false;
          }
        };

        rafHandleRef.current = requestAnimationFrame(animateStep);
      }
    },
    [commitTickToCanvas]
  );

  // Register fast callback for sub-millisecond invocation
  useEffect(() => {
    if (onFastTickRef) {
      onFastTickRef.current = scheduleTick;
    }
  }, [onFastTickRef, scheduleTick]);

  // Reactive fallback
  useEffect(() => {
    if (liveTick) {
      const tickKey = `${liveTick.time}_${liveTick.close}_${liveTick.tickIndex || 0}_${liveTick.serverTimestamp || 0}`;
      if (lastProcessedTickRef.current !== tickKey) {
        lastProcessedTickRef.current = tickKey;
        scheduleTick(liveTick);
      }
    }
  }, [liveTick, scheduleTick]);

  // Clean up RAF loop on unmount
  useEffect(() => {
    return () => {
      if (rafHandleRef.current) {
        cancelAnimationFrame(rafHandleRef.current);
      }
    };
  }, []);

  return (
    <div
      id="tradingview-chart-wrapper"
      className="relative w-full h-full flex-1 min-h-[420px] select-none overflow-hidden flex"
    >
      {/* TradingView Left Drawing & Tools Sidebar */}
      <aside
        id="tradingview-left-toolbar"
        className="w-10 h-full border-r border-slate-200 dark:border-[#2a2e39] bg-slate-50 dark:bg-[#1e222d] flex flex-col items-center py-2 gap-1.5 z-20 shrink-0 select-none text-slate-600 dark:text-[#848e9c]"
      >
        {/* Cursor Mode */}
        <button
          id="tool-crosshair"
          onClick={() => setCursorTool('crosshair')}
          title="Crosshair Cursor"
          className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${
            cursorTool === 'crosshair'
              ? 'bg-blue-600 text-white'
              : 'hover:bg-slate-200 dark:hover:bg-[#2a2e39] text-slate-700 dark:text-slate-300'
          }`}
        >
          <Crosshair className="w-3.5 h-3.5" />
        </button>

        <button
          id="tool-dot"
          onClick={() => setCursorTool('dot')}
          title="Dot Cursor"
          className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${
            cursorTool === 'dot'
              ? 'bg-blue-600 text-white'
              : 'hover:bg-slate-200 dark:hover:bg-[#2a2e39] text-slate-700 dark:text-slate-300'
          }`}
        >
          <Dot className="w-4 h-4" />
        </button>

        <button
          id="tool-arrow"
          onClick={() => setCursorTool('arrow')}
          title="Arrow Pointer"
          className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${
            cursorTool === 'arrow'
              ? 'bg-blue-600 text-white'
              : 'hover:bg-slate-200 dark:hover:bg-[#2a2e39] text-slate-700 dark:text-slate-300'
          }`}
        >
          <MousePointer className="w-3.5 h-3.5" />
        </button>

        <div className="w-5 h-[1px] bg-slate-200 dark:bg-[#2a2e39] my-1" />

        {/* Magnet Mode */}
        <button
          id="tool-magnet"
          onClick={() => setMagnetMode((prev) => !prev)}
          title={`Magnet Mode: ${magnetMode ? 'ON (Snapping to OHLC)' : 'OFF'}`}
          className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${
            magnetMode
              ? 'bg-blue-500/20 text-blue-500 font-bold border border-blue-500/40'
              : 'hover:bg-slate-200 dark:hover:bg-[#2a2e39] text-slate-700 dark:text-slate-300'
          }`}
        >
          <Magnet className="w-3.5 h-3.5" />
        </button>

        {/* Measure / Ruler tool */}
        <button
          id="tool-ruler"
          onClick={() => setRulerActive((prev) => !prev)}
          title={`Measure Tool: ${rulerActive ? 'ACTIVE' : 'OFF'}`}
          className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${
            rulerActive
              ? 'bg-amber-500/20 text-amber-500 font-bold border border-amber-500/40'
              : 'hover:bg-slate-200 dark:hover:bg-[#2a2e39] text-slate-700 dark:text-slate-300'
          }`}
        >
          <Ruler className="w-3.5 h-3.5" />
        </button>

        {/* Toggle Floating On-Candle Price Tag */}
        <button
          id="tool-toggle-candle-tag"
          onClick={() => setShowOnCandlePrice((prev) => !prev)}
          title={`On-Candle Price Tag: ${showOnCandlePrice ? 'VISIBLE' : 'HIDDEN'}`}
          className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${
            showOnCandlePrice
              ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/40'
              : 'hover:bg-slate-200 dark:hover:bg-[#2a2e39] text-slate-700 dark:text-slate-300 opacity-60'
          }`}
        >
          <Tag className="w-3.5 h-3.5" />
        </button>

        {/* Toggle Foreground Live HUD */}
        <button
          id="tool-toggle-foreground-hud"
          onClick={() => setShowForegroundHud((prev) => !prev)}
          title={`Side Foreground Live HUD: ${showForegroundHud ? 'VISIBLE' : 'HIDDEN'}`}
          className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${
            showForegroundHud
              ? 'bg-blue-500/20 text-blue-500 font-bold border border-blue-500/40'
              : 'hover:bg-slate-200 dark:hover:bg-[#2a2e39] text-slate-700 dark:text-slate-300 opacity-60'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
        </button>

        {/* Center / Focus Real-Time Candle */}
        <button
          id="tool-focus-live-candle"
          onClick={handleCenterLiveCandle}
          title="Focus & Center Live Candle"
          className="w-7 h-7 rounded hover:bg-slate-200 dark:hover:bg-[#2a2e39] text-slate-700 dark:text-slate-300 flex items-center justify-center transition-colors"
        >
          <LocateFixed className="w-3.5 h-3.5 text-blue-500" />
        </button>

        <div className="mt-auto flex flex-col items-center gap-1.5">
          {/* Zoom In */}
          <button
            id="tool-zoom-in"
            onClick={handleZoomIn}
            title="Zoom In (Time Scale)"
            className="w-7 h-7 rounded hover:bg-slate-200 dark:hover:bg-[#2a2e39] text-slate-700 dark:text-slate-300 flex items-center justify-center transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          {/* Zoom Out */}
          <button
            id="tool-zoom-out"
            onClick={handleZoomOut}
            title="Zoom Out (Time Scale)"
            className="w-7 h-7 rounded hover:bg-slate-200 dark:hover:bg-[#2a2e39] text-slate-700 dark:text-slate-300 flex items-center justify-center transition-colors"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          {/* Fit Screen */}
          <button
            id="tool-fit-content"
            onClick={handleFitContent}
            title="Reset Zoom / Fit Content"
            className="w-7 h-7 rounded hover:bg-slate-200 dark:hover:bg-[#2a2e39] text-slate-700 dark:text-slate-300 flex items-center justify-center transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </aside>

      {/* Main Canvas Container */}
      <div className="relative flex-1 w-full h-full overflow-hidden">
        {/* Chart Canvas Host */}
        <div
          id="tradingview-chart-container"
          ref={containerRef}
          className="w-full h-full"
        />

        {/* Loading Historical Candles Status Indicator */}
        {isHistoryLoading && (
          <div
            id="historical-candles-loader"
            className="absolute top-2.5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-slate-900/90 dark:bg-slate-900/95 text-white px-3 py-1.5 rounded-full border border-slate-700/80 shadow-md text-xs font-mono backdrop-blur-xs transition-opacity duration-150 animate-pulse"
          >
            <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />
            <span>Loading historical candles...</span>
          </div>
        )}

        {/* Watermark Branding */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="text-center opacity-[0.035] dark:opacity-[0.05] tracking-wider font-bold">
            <div className="text-7xl font-mono">{assetSymbol}</div>
            <div className="text-sm font-sans tracking-[0.3em] uppercase mt-1">TradingView Chart Engine</div>
          </div>
        </div>

        {/* Floating Real-Time OHLC Legend Overlay */}
        <div
          id="chart-ohlc-legend"
          className="absolute top-2.5 left-3 pointer-events-none z-10 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-mono backdrop-blur-xs bg-white/70 dark:bg-black/40 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 shadow-xs"
        >
          <span className="font-bold tracking-tight text-slate-900 dark:text-white">
            {assetSymbol}
          </span>
          {activeLegend ? (
            <>
              {activeLegend.dateStr && (
                <span className="text-slate-500 dark:text-slate-400">
                  {activeLegend.dateStr}
                </span>
              )}
              <span className="text-slate-500 dark:text-slate-400">
                {activeLegend.timeStr}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 dark:text-slate-400 inline-flex items-center">
                  O:<span className="text-slate-800 dark:text-slate-200 ml-0.5 font-mono tabular-nums min-w-[85px] inline-block">{formatPrice(activeLegend.open)}</span>
                </span>
                <span className="text-slate-500 dark:text-slate-400 inline-flex items-center">
                  H:<span className="text-slate-800 dark:text-slate-200 ml-0.5 font-mono tabular-nums min-w-[85px] inline-block">{formatPrice(activeLegend.high)}</span>
                </span>
                <span className="text-slate-500 dark:text-slate-400 inline-flex items-center">
                  L:<span className="text-slate-800 dark:text-slate-200 ml-0.5 font-mono tabular-nums min-w-[85px] inline-block">{formatPrice(activeLegend.low)}</span>
                </span>
                <span className="text-slate-500 dark:text-slate-400 inline-flex items-center">
                  C:<span className="text-slate-800 dark:text-slate-200 ml-0.5 font-mono tabular-nums min-w-[85px] inline-block">{formatPrice(activeLegend.close)}</span>
                </span>
                <span
                  className={`font-semibold font-mono tabular-nums min-w-[165px] inline-block ${
                    activeLegend.isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {activeLegend.change >= 0 ? '+' : ''}
                  {formatPrice(activeLegend.change)} ({activeLegend.changePercent >= 0 ? '+' : ''}
                  {activeLegend.changePercent.toFixed(2)}%)
                </span>
              </div>
            </>
          ) : (
            <span className="text-slate-400 dark:text-slate-500">Connecting to stream...</span>
          )}

          {/* Candle Close Countdown Timer */}
          {candleCountdown && (
            <div
              className="flex items-center gap-1 pl-2 border-l border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-[11px]"
              title="Time remaining until active candle closes"
            >
              <Clock className="w-3 h-3 text-blue-500" />
              <span className="font-mono text-blue-600 dark:text-blue-400 font-semibold">{candleCountdown}</span>
            </div>
          )}
        </div>

        {/* Active Indicator Legend Badges */}
        <div className="absolute top-10 left-3 pointer-events-none z-10 flex flex-col gap-1 text-[11px] font-mono">
          {indicators.showSma20 && (
            <div className="flex items-center gap-1.5 text-amber-500 font-medium">
              <span className="w-2 h-0.5 bg-amber-500 inline-block" />
              <span>SMA 20</span>
            </div>
          )}
          {indicators.showEma50 && (
            <div className="flex items-center gap-1.5 text-blue-500 font-medium">
              <span className="w-2 h-0.5 bg-blue-500 inline-block" />
              <span>EMA 50</span>
            </div>
          )}
          {indicators.showBollingerBands && (
            <div className="flex items-center gap-1.5 text-purple-400 font-medium">
              <span className="w-2 h-0.5 bg-purple-400 inline-block" />
              <span>BB (20, 2)</span>
            </div>
          )}
          {indicators.showVolume && (
            <div className="flex items-center gap-1.5 text-slate-400 font-medium">
              <span className="w-2 h-2 rounded-xs bg-slate-400/40 inline-block" />
              <span>Vol (Ticks)</span>
            </div>
          )}

          {/* Applied Pine Script Badge with controls */}
          {pineResult && pineResult.success && (
            <div className="pointer-events-auto mt-0.5 flex flex-wrap items-center gap-2 bg-slate-900/90 dark:bg-slate-900/95 text-white px-2 py-1 rounded-md border border-slate-700/80 shadow-md text-xs font-mono">
              <span className="flex items-center gap-1 font-semibold text-blue-400">
                <Code className="w-3.5 h-3.5 text-blue-400" />
                {pineResult.scriptName || 'Custom Pine Script'}
              </span>

              {/* Plotted values */}
              {pineResult.plots && pineResult.plots.length > 0 && (
                <div className="flex items-center gap-2 border-l border-slate-700 pl-2">
                  {pineResult.plots.slice(0, 4).map((plot) => {
                    const lastPt = plot.data && plot.data.length > 0 ? plot.data[plot.data.length - 1] : null;
                    return (
                      <span key={plot.id} className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: plot.color || '#3b82f6' }} />
                        <span className="text-slate-300 text-[10px]">{plot.title}:</span>
                        <span className="font-semibold text-white text-[10px]">
                          {lastPt && lastPt.value !== undefined && lastPt.value !== null ? lastPt.value.toFixed(2) : '-'}
                        </span>
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Controls */}
              <div className="flex items-center gap-1 border-l border-slate-700 pl-1.5">
                <button
                  type="button"
                  onClick={() => setIsPineVisible(!isPineVisible)}
                  className="hover:bg-slate-800 p-1 rounded text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title={isPineVisible ? "Hide Pine Script on chart" : "Show Pine Script on chart"}
                >
                  {isPineVisible ? <Eye className="w-3.5 h-3.5 text-emerald-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
                </button>

                {onOpenPineEditor && (
                  <button
                    type="button"
                    onClick={onOpenPineEditor}
                    className="hover:bg-slate-800 p-1 rounded text-slate-400 hover:text-white transition-colors cursor-pointer"
                    title="Open Pine Editor"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                )}

                {onRemovePineScript && (
                  <button
                    type="button"
                    onClick={onRemovePineScript}
                    className="hover:bg-rose-900/60 p-1 rounded text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                    title="Remove Pine Script from chart"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Real-time Floating On-Candle Price Marker & Tag */}
        {showOnCandlePrice && (
          <div
            ref={floatingTagRef}
            id="floating-on-candle-price-tag"
            className="absolute pointer-events-none z-20 flex items-center transition-all duration-75 ease-out"
            style={{ display: 'none' }}
          >
            {/* Live pulsing beacon at the exact candle tip */}
            <div className="absolute -left-2.5 flex items-center justify-center">
              <span
                className={`absolute w-3.5 h-3.5 rounded-full animate-ping opacity-75 ${
                  (activeLegend?.isUp ?? true) ? 'bg-emerald-400' : 'bg-rose-400'
                }`}
              />
              <span
                className={`w-2 h-2 rounded-full ring-2 ring-white dark:ring-black shadow-sm ${
                  (activeLegend?.isUp ?? true) ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
              />
            </div>

            {/* Glowing On-Candle Floating Pill */}
            <div
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[11px] font-bold shadow-lg border backdrop-blur-md transition-colors whitespace-nowrap ${
                (activeLegend?.isUp ?? true)
                  ? 'bg-emerald-600/90 text-white border-emerald-400 shadow-emerald-500/25'
                  : 'bg-rose-600/90 text-white border-rose-400 shadow-rose-500/25'
              }`}
            >
              <span>{(activeLegend?.isUp ?? true) ? '▲' : '▼'}</span>
              <span className="tracking-tight">
                {formatPrice(activeLegend?.close || 0)}
              </span>
            </div>
          </div>
        )}

        {/* Side Foreground Live Price HUD Card */}
        {showForegroundHud && (
          <div
            id="chart-foreground-live-hud"
            className="absolute top-2.5 right-14 z-20 flex flex-col gap-1.5 p-2 rounded-lg border backdrop-blur-md bg-white/95 dark:bg-[#1e222d]/95 border-slate-200 dark:border-[#2a2e39] shadow-xl text-slate-800 dark:text-[#d1d4dc] font-mono select-none w-56 transition-all"
          >
            <div className="flex items-center justify-between gap-1 border-b border-slate-200/80 dark:border-[#2a2e39]/80 pb-1">
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Live Foreground
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  id="btn-hud-tag-toggle"
                  onClick={() => setShowOnCandlePrice((prev) => !prev)}
                  title={showOnCandlePrice ? 'Hide candle price tag' : 'Show candle price tag'}
                  className={`text-[9px] px-1 py-0.5 rounded font-sans font-semibold border transition-colors ${
                    showOnCandlePrice
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-400 border-transparent hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  Tag
                </button>
                <button
                  id="btn-hud-focus"
                  onClick={handleCenterLiveCandle}
                  title="Center Live Candle"
                  className="text-[9px] px-1.5 py-0.5 rounded font-sans font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-[#2a2e39] transition-colors"
                >
                  Focus
                </button>
              </div>
            </div>

            {/* Actual Live Price Large Display */}
            <div className="flex items-baseline justify-between gap-1 pt-0.5">
              <div
                className={`text-base font-extrabold tracking-tight font-mono tabular-nums ${
                  (activeLegend?.isUp ?? true)
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {formatPrice(activeLegend?.close ?? 0)}
              </div>
            </div>

            {/* Live Delta & Candle Countdown */}
            <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono">
              <span
                className={`font-semibold font-mono tabular-nums ${
                  (activeLegend?.change ?? 0) >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {(activeLegend?.change ?? 0) >= 0 ? '+' : ''}
                {formatPrice(activeLegend?.change ?? 0)} (
                {(activeLegend?.changePercent ?? 0) >= 0 ? '+' : ''}
                {(activeLegend?.changePercent ?? 0).toFixed(2)}%)
              </span>
              {candleCountdown && (
                <span className="text-blue-500 dark:text-blue-400 font-semibold font-mono tabular-nums text-[10px]" title="Time left in current candle">
                  ⏱ {candleCountdown}
                </span>
              )}
            </div>

            {/* Active Candle OHLC Snapshot */}
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9px] pt-1 border-t border-slate-100 dark:border-[#2a2e39]/60 text-slate-400">
              <div className="truncate">O: <span className="text-slate-700 dark:text-slate-300 font-medium font-mono tabular-nums">{formatPrice(activeLegend?.open ?? 0)}</span></div>
              <div className="truncate">H: <span className="text-slate-700 dark:text-slate-300 font-medium font-mono tabular-nums">{formatPrice(activeLegend?.high ?? 0)}</span></div>
              <div className="truncate">L: <span className="text-slate-700 dark:text-slate-300 font-medium font-mono tabular-nums">{formatPrice(activeLegend?.low ?? 0)}</span></div>
              <div className="truncate">C: <span className="text-slate-700 dark:text-slate-300 font-semibold font-mono tabular-nums">{formatPrice(activeLegend?.close ?? 0)}</span></div>
            </div>
          </div>
        )}

        {/* Bottom Quick Range & TradingView Scale Mode Bar */}
        <div
          id="tradingview-bottom-quick-bar"
          className="absolute bottom-1.5 left-3 right-16 z-10 flex items-center justify-between pointer-events-none"
        >
          {/* Quick Time Range Selector */}
          <div className="pointer-events-auto flex items-center gap-1 bg-white/80 dark:bg-[#1e222d]/80 backdrop-blur-xs p-0.5 rounded-md border border-slate-200 dark:border-[#2a2e39] text-[11px] font-medium text-slate-600 dark:text-[#848e9c]">
            {(['15m', '1h', '4h', '12h', '1D', 'All'] as const).map((range) => (
              <button
                key={range}
                id={`btn-range-${range}`}
                onClick={() => handleSetQuickRange(range)}
                className="px-1.5 py-0.5 rounded hover:bg-slate-200 dark:hover:bg-[#2a2e39] hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                {range}
              </button>
            ))}
          </div>

          {/* Right Price Scale Mode (AUTO, LOG, %) */}
          <div className="pointer-events-auto flex items-center gap-1 bg-white/80 dark:bg-[#1e222d]/80 backdrop-blur-xs p-0.5 rounded-md border border-slate-200 dark:border-[#2a2e39] text-[11px] font-mono font-medium text-slate-600 dark:text-[#848e9c]">
            <button
              id="scale-mode-percent"
              onClick={() => setPriceScaleMode((prev) => (prev === 'percentage' ? 'normal' : 'percentage'))}
              title="Percentage Price Scale"
              className={`px-1.5 py-0.5 rounded transition-colors ${
                priceScaleMode === 'percentage'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'hover:bg-slate-200 dark:hover:bg-[#2a2e39]'
              }`}
            >
              %
            </button>
            <button
              id="scale-mode-log"
              onClick={() => setPriceScaleMode((prev) => (prev === 'logarithmic' ? 'normal' : 'logarithmic'))}
              title="Logarithmic Price Scale"
              className={`px-1.5 py-0.5 rounded transition-colors ${
                priceScaleMode === 'logarithmic'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'hover:bg-slate-200 dark:hover:bg-[#2a2e39]'
              }`}
            >
              log
            </button>
            <button
              id="scale-mode-auto"
              onClick={() => setIsAutoScale((prev) => !prev)}
              title="Auto Scale"
              className={`px-1.5 py-0.5 rounded transition-colors ${
                isAutoScale
                  ? 'bg-blue-500/20 text-blue-500 font-bold'
                  : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-[#2a2e39]'
              }`}
            >
              auto
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
