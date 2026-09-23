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
  Settings,
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
  onConfigureIndicator?: (target: 'sma' | 'ema' | 'bb') => void;
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
  onConfigureIndicator,
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

  // Timeframe and historical tracking refs
  const lastRenderedTimeframeRef = useRef<number>(currentTimeframe);
  const lastOldestCandleTimeRef = useRef<number | null>(null);
  const lastCandlesLengthRef = useRef<number>(0);
  const isTimeframeTransitioningRef = useRef<boolean>(false);
  const timeframePendingScrollRef = useRef<boolean>(true);
  const hasUserScrolledLeftRef = useRef<boolean>(false);
  const lastLoadMoreTriggerTimeRef = useRef<number>(0);
  const savedViewStateRef = useRef<{
    isAtLiveCandle: boolean;
    centerTimestamp: number | null;
    visibleTimeSpan: number | null;
  }>({
    isAtLiveCandle: true,
    centerTimestamp: null,
    visibleTimeSpan: null,
  });

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
  const rafHandleRef = useRef<number | null>(null);
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

  const isHistoryLoadingRef = useRef(isHistoryLoading);
  isHistoryLoadingRef.current = isHistoryLoading;

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
    const tagEl = floatingTagRef.current;
    if (!chart || !series || !tagEl) return;

    if (isTimeframeTransitioningRef.current) {
      tagEl.style.display = 'none';
      return;
    }

    const anim = animCandleRef.current;
    let targetTime = anim.time;
    let targetClose = anim.currentClose;

    if (!targetTime || !targetClose) {
      const dataset = candlesRef.current;
      if (dataset && dataset.length > 0) {
        const last = dataset[dataset.length - 1];
        targetTime = last.time;
        targetClose = last.close;
      } else {
        tagEl.style.display = 'none';
        return;
      }
    }

    try {
      const x = chart.timeScale().timeToCoordinate(targetTime as any);
      const y = series.priceToCoordinate(targetClose);

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
    } catch {
      tagEl.style.display = 'none';
    }
  }, []);

  const hasScrolledToLiveRef = useRef<boolean>(false);

  // Focus chart viewport on the latest live candle side
  const scrollToLiveCandles = useCallback((datasetOverride?: FormattedCandle[]) => {
    const chart = chartRef.current;
    const dataset = datasetOverride || candlesRef.current;
    if (!chart || !dataset || dataset.length === 0) return;
    try {
      const timeScale = chart.timeScale();
      const total = dataset.length;
      const visibleBars = Math.min(total, 65);
      timeScale.applyOptions({
        rightOffset: 12,
        barSpacing: 14,
      });
      timeScale.setVisibleLogicalRange({
        from: Math.max(0, total - visibleBars),
        to: total + 8,
      });
      timeScale.scrollToPosition(0, false);
      hasScrolledToLiveRef.current = true;
      hasUserScrolledLeftRef.current = false;
    } catch {
      try {
        chartRef.current?.timeScale().scrollToRealTime();
      } catch {}
    }
  }, []);

  // Center chart camera on the active live candle
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

  // Quick Time Range Selector with interval-adaptive minimum bar protection
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

    // Ensure at least 12 bars are always in view so higher timeframes never display broken sub-candle slices
    const minSpan = currentTimeframe * 12;
    const effectiveSpan = Math.max(secondsBack, minSpan);

    const fromTime = toTime - effectiveSpan;
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

    // Subscribe to range and scroll changes with safe pagination throttling
    const handleLogicalRangeChange = (newRange: any) => {
      updateCandleCoords();
      if (!newRange || isTimeframeTransitioningRef.current || timeframePendingScrollRef.current) return;

      const dataset = candlesRef.current;
      const totalBars = dataset.length;

      // Track if user has genuinely scrolled backwards to view older history
      if (newRange.to < totalBars - 6) {
        hasUserScrolledLeftRef.current = true;
      } else {
        hasUserScrolledLeftRef.current = false;
      }

      // Safe trigger: only request older chunks if user scrolled left and dataset has enough initial bars
      const now = Date.now();
      if (
        hasUserScrolledLeftRef.current &&
        !isHistoryLoadingRef.current &&
        totalBars >= 25 &&
        newRange.from < 5 &&
        now - lastLoadMoreTriggerTimeRef.current > 1200
      ) {
        lastLoadMoreTriggerTimeRef.current = now;
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
      } catch {}
      chartRef.current = null;
    };
  }, [isDark]);

  // Update Crosshair Mode dynamically
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

  // Update Price Scale Mode dynamically
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

  // 2. Setup or Re-create Main Series ONLY when chartType changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (mainSeriesRef.current && currentSeriesTypeRef.current === chartType) {
      return;
    }

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
      } catch (err) {
        console.warn('Error setting main series data:', err);
      }
    }

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
  }, [chartType, isDark, safeRemoveSeries, updateDefaultLegend, scrollToLiveCandles]);

  // 3. Update main series data with seamless timeframe transition & logical range handling
  useEffect(() => {
    const series = mainSeriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart || !candles || candles.length === 0) return;

    const isTimeframeChanged = lastRenderedTimeframeRef.current !== currentTimeframe;
    const shouldResetToLive = isTimeframeChanged || timeframePendingScrollRef.current || !hasScrolledToLiveRef.current;
    const dataKey = `${currentTimeframe}_${chartType}_${candles.length}_${candles[0]?.time}_${candles[candles.length - 1]?.time}`;
    if (lastCandleDataKeyRef.current === dataKey && !shouldResetToLive) {
      return;
    }
    lastCandleDataKeyRef.current = dataKey;

    try {
      const previousRange = chart.timeScale().getVisibleLogicalRange();
      const oldOldestTime = lastOldestCandleTimeRef.current;

      lastOldestCandleTimeRef.current = candles[0]?.time || null;
      lastCandlesLengthRef.current = candles.length;
      lastRenderedTimeframeRef.current = currentTimeframe;

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

      // If timeframe changed or reset is requested, preserve exact scroll position and pin live candle / time area
      if (shouldResetToLive) {
        timeframePendingScrollRef.current = false;
        isTimeframeTransitioningRef.current = false;

        const viewState = savedViewStateRef.current;
        const total = candles.length;

        const performRestore = () => {
          if (!chartRef.current || !candles || candles.length === 0) return;
          try {
            const timeScale = chartRef.current.timeScale();

            if (viewState.isAtLiveCandle || !viewState.centerTimestamp) {
              // User was viewing the live candle: keep the live candle pinned at the exact right position
              hasUserScrolledLeftRef.current = false;
              hasScrolledToLiveRef.current = true;
              const visibleBars = Math.min(total, 65);
              timeScale.applyOptions({
                rightOffset: 12,
                barSpacing: 14,
              });
              timeScale.setVisibleLogicalRange({
                from: Math.max(0, total - visibleBars),
                to: total + 8,
              });
              timeScale.scrollToPosition(0, false);
            } else {
              // User was inspecting a historical area / timestamp: preserve the visible center timestamp
              const targetTime = viewState.centerTimestamp;
              let bestIdx = -1;
              let minDiff = Infinity;
              for (let i = 0; i < candles.length; i++) {
                const diff = Math.abs(candles[i].time - targetTime);
                if (diff < minDiff) {
                  minDiff = diff;
                  bestIdx = i;
                }
              }

              if (bestIdx >= 0) {
                hasUserScrolledLeftRef.current = true;
                hasScrolledToLiveRef.current = false;
                const halfBars = Math.max(15, Math.min(35, Math.floor(total / 4)));
                timeScale.applyOptions({
                  rightOffset: 12,
                  barSpacing: 14,
                });
                timeScale.setVisibleLogicalRange({
                  from: Math.max(0, bestIdx - halfBars),
                  to: Math.min(total + 5, bestIdx + halfBars),
                });
              } else {
                hasUserScrolledLeftRef.current = false;
                hasScrolledToLiveRef.current = true;
                const visibleBars = Math.min(total, 65);
                timeScale.setVisibleLogicalRange({
                  from: Math.max(0, total - visibleBars),
                  to: total + 8,
                });
                timeScale.scrollToPosition(0, false);
              }
            }
          } catch {}
          updateCandleCoords();
        };

        performRestore();
        requestAnimationFrame(performRestore);
        setTimeout(performRestore, 30);
        setTimeout(performRestore, 80);
        setTimeout(performRestore, 180);
      } else if (previousRange && oldOldestTime !== null && candles[0].time < oldOldestTime) {
        // Prevent scroll jump when loading older historical candles (pagination)
        const prependedCount = candles.findIndex((c) => c.time === oldOldestTime);
        if (prependedCount > 0) {
          chart.timeScale().setVisibleLogicalRange({
            from: previousRange.from + prependedCount,
            to: previousRange.to + prependedCount,
          });
        }
      } else if (hasUserScrolledLeftRef.current && previousRange && previousRange.to > 5 && previousRange.from < candles.length) {
        chart.timeScale().setVisibleLogicalRange(previousRange);
      } else {
        scrollToLiveCandles(candles);
      }
    } catch (err) {
      console.warn('Error updating candle data:', err);
    }
  }, [candles, chartType, currentTimeframe, scrollToLiveCandles, updateCandleCoords]);

  // Synchronize animCandleRef and clean overlays immediately whenever timeframe changes
  useEffect(() => {
    // Capture the exact current view state before resetting overlays
    if (chartRef.current) {
      try {
        const timeScale = chartRef.current.timeScale();
        const logicalRange = timeScale.getVisibleLogicalRange();
        const timeRange = timeScale.getVisibleRange();
        const dataset = candlesRef.current;
        const totalBars = dataset.length;

        if (logicalRange && totalBars > 0) {
          const offsetFromRight = totalBars - logicalRange.to;
          const isAtLive = !hasUserScrolledLeftRef.current || offsetFromRight <= 3;
          let centerTime: number | null = null;
          let span: number | null = null;
          if (timeRange && typeof timeRange.from === 'number' && typeof timeRange.to === 'number') {
            centerTime = (timeRange.from + timeRange.to) / 2;
            span = timeRange.to - timeRange.from;
          }

          savedViewStateRef.current = {
            isAtLiveCandle: isAtLive,
            centerTimestamp: centerTime,
            visibleTimeSpan: span,
          };
        }
      } catch {}
    }

    isTimeframeTransitioningRef.current = true;
    timeframePendingScrollRef.current = true;
    hasScrolledToLiveRef.current = false;
    hasUserScrolledLeftRef.current = false;
    lastOldestCandleTimeRef.current = null;
    lastCandleDataKeyRef.current = '';
    if (floatingTagRef.current) {
      floatingTagRef.current.style.display = 'none';
    }
    if (rafHandleRef.current) {
      cancelAnimationFrame(rafHandleRef.current);
      rafHandleRef.current = null;
    }

    if (pineMarkersPluginRef.current) {
      try {
        if (typeof pineMarkersPluginRef.current.setMarkers === 'function') {
          pineMarkersPluginRef.current.setMarkers([]);
        }
        if (typeof pineMarkersPluginRef.current.detach === 'function') {
          pineMarkersPluginRef.current.detach();
        }
      } catch {}
      pineMarkersPluginRef.current = null;
    }

    for (const s of pineSeriesRefs.current) {
      safeRemoveSeries(s);
    }
    pineSeriesRefs.current = [];

    if (mainSeriesRef.current) {
      for (const pl of pinePriceLinesRef.current) {
        try {
          mainSeriesRef.current.removePriceLine(pl);
        } catch {}
      }
    }
    pinePriceLinesRef.current = [];
  }, [currentTimeframe, safeRemoveSeries]);

  // 4. Setup Volume Pane
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
        priceScaleId: '',
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
        // Force priceScale options refresh on volume scale
        volumeSeriesRef.current.priceScale().applyOptions({
          scaleMargins: {
            top: 0.82,
            bottom: 0,
          },
        });
      } catch (err) {
        console.warn('Error setting volume data:', err);
      }
    }
  }, [indicators.showVolume, candles, isDark, currentTimeframe, safeRemoveSeries]);

  // 5. Setup Technical Overlays (SMA, EMA, Bollinger Bands) with adaptive calculations
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

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

    // SMA
    if (indicators.showSma20) {
      const smaPeriod = indicators.smaPeriod ?? 20;
      const smaData = calculateSMA(candles, smaPeriod).filter((pt) => typeof pt.value === 'number' && !isNaN(pt.value));
      if (smaData.length > 0) {
        const smaSeries = chart.addSeries(LineSeries, {
          color: '#f59e0b',
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          title: `SMA ${smaPeriod}`,
        });
        smaSeries.setData(smaData as any);
        smaSeriesRef.current = smaSeries;
      }
    }

    // EMA
    if (indicators.showEma50) {
      const emaPeriod = indicators.emaPeriod ?? 50;
      const emaData = calculateEMA(candles, emaPeriod).filter((pt) => typeof pt.value === 'number' && !isNaN(pt.value));
      if (emaData.length > 0) {
        const emaSeries = chart.addSeries(LineSeries, {
          color: '#3b82f6',
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          title: `EMA ${emaPeriod}`,
        });
        emaSeries.setData(emaData as any);
        emaSeriesRef.current = emaSeries;
      }
    }

    // Bollinger Bands
    if (indicators.showBollingerBands) {
      const bbPeriod = indicators.bbPeriod ?? 20;
      const bbStdDev = indicators.bbStdDev ?? 2;
      const { upper, middle, lower } = calculateBollingerBands(candles, bbPeriod, bbStdDev);
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
  }, [
    indicators.showSma20,
    indicators.smaPeriod,
    indicators.showEma50,
    indicators.emaPeriod,
    indicators.showBollingerBands,
    indicators.bbPeriod,
    indicators.bbStdDev,
    candles,
    currentTimeframe,
    safeRemoveSeries,
  ]);

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
  }, [indicators.showHighLowLevels, candles, currentTimeframe]);

  // 6.1 Pine Script Plots & Indicators Overlay Engine
  useEffect(() => {
    const chart = chartRef.current;
    const mainSeries = mainSeriesRef.current;
    if (!chart) return;

    for (const s of pineSeriesRefs.current) {
      safeRemoveSeries(s);
    }
    pineSeriesRefs.current = [];

    if (mainSeries) {
      for (const pl of pinePriceLinesRef.current) {
        try {
          mainSeries.removePriceLine(pl);
        } catch {}
      }
    }
    pinePriceLinesRef.current = [];

    if (pineMarkersPluginRef.current) {
      try {
        if (typeof pineMarkersPluginRef.current.setMarkers === 'function') {
          pineMarkersPluginRef.current.setMarkers([]);
        }
        if (typeof pineMarkersPluginRef.current.detach === 'function') {
          pineMarkersPluginRef.current.detach();
        }
      } catch {}
      pineMarkersPluginRef.current = null;
    }

    if (!pineResult || !pineResult.success || !isPineVisible || !candles || candles.length === 0) {
      return;
    }

    if (pineResult.timeframe && pineResult.timeframe !== currentTimeframe) {
      return;
    }

    try {
      const isOverlay = pineResult.isOverlay !== false;

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

      // Render Plotted Series
      if (pineResult.plots && pineResult.plots.length > 0) {
        for (const plot of pineResult.plots) {
          if (!plot.data || plot.data.length === 0) continue;

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

      // Render Horizontal Reference Lines
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

      // Render Pine Markers
      if (mainSeries && pineResult.markers && pineResult.markers.length > 0) {
        const candleTimeSet = new Set(candles.map((c) => c.time));
        const candleMinTime = candles[0].time;
        const candleMaxTime = candles[candles.length - 1].time;

        const timeToMarkerMap = new Map<number, (typeof pineResult.markers)[0]>();

        for (const m of pineResult.markers) {
          if (typeof m.time !== 'number' || isNaN(m.time)) continue;
          if (m.time < candleMinTime || m.time > candleMaxTime) continue;
          if (!candleTimeSet.has(m.time)) continue;

          const existing = timeToMarkerMap.get(m.time);
          if (!existing) {
            timeToMarkerMap.set(m.time, m);
          } else {
            // Prioritize breakout signals over swing/test signals on the same bar
            const isExistingBreakout = (existing.text || '').includes('Breakout');
            const isNewBreakout = (m.text || '').includes('Breakout');
            if (isNewBreakout && !isExistingBreakout) {
              timeToMarkerMap.set(m.time, m);
            }
          }
        }

        const cleanMarkers = Array.from(timeToMarkerMap.values())
          .sort((a, b) => a.time - b.time)
          .map((m) => {
            const text = (m.text || '').trim();
            const rawShape = m.shape || (m.position === 'belowBar' ? 'arrowUp' : 'arrowDown');
            let validShape: 'arrowUp' | 'arrowDown' | 'circle' | 'square' = 'arrowUp';
            if (rawShape === 'arrowDown' || rawShape === 'labelDown' || rawShape === 'triangleDown') {
              validShape = 'arrowDown';
            } else if (rawShape === 'circle') {
              validShape = 'circle';
            } else if (rawShape === 'square') {
              validShape = 'square';
            } else {
              validShape = 'arrowUp';
            }

            return {
              time: m.time as any,
              position: (m.position === 'inBar' ? 'aboveBar' : m.position) || 'aboveBar',
              color: m.color || (m.position === 'belowBar' ? '#22c55e' : '#ef4444'),
              shape: validShape,
              text,
              size: m.size || 1,
            };
          });

        if (cleanMarkers.length > 0) {
          pineMarkersPluginRef.current = createSeriesMarkers(mainSeries, cleanMarkers);
        }
      }
    } catch (err) {
      console.warn('Error rendering Pine Script overlays:', err);
    }

    return () => {
      if (pineMarkersPluginRef.current) {
        try {
          if (typeof pineMarkersPluginRef.current.setMarkers === 'function') {
            pineMarkersPluginRef.current.setMarkers([]);
          }
          if (typeof pineMarkersPluginRef.current.detach === 'function') {
            pineMarkersPluginRef.current.detach();
          }
        } catch {}
        pineMarkersPluginRef.current = null;
      }
    };
  }, [pineResult, isPineVisible, candles, currentTimeframe, safeRemoveSeries]);

  // 7. Optimal Double-Buffered RAF Real-Time Tick Dispatcher
  const commitTickToCanvas = useCallback(
    (tick: LiveTick) => {
      if (!mainSeriesRef.current || !chartRef.current) return;
      if (!tick || typeof tick.time !== 'number' || isNaN(tick.time)) return;
      if (typeof tick.close !== 'number' || isNaN(tick.close)) return;

      if (lastCandleTimeRef.current && tick.time < lastCandleTimeRef.current) {
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
      }

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

      updateCandleCoords();

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
    [chartType, indicators.showHighLowLevels, isDark, updateCandleCoords]
  );

  // 60 FPS Fluid Continuous Easing Real-Time Tick Dispatcher
  const scheduleTick = useCallback(
    (tick: LiveTick) => {
      if (!tick || typeof tick.time !== 'number' || isNaN(tick.time)) return;
      if (typeof tick.close !== 'number' || isNaN(tick.close)) return;

      const anim = animCandleRef.current;

      const tickKey = `${tick.time}_${tick.close}_${tick.tickIndex || 0}_${tick.serverTimestamp || 0}`;
      lastProcessedTickRef.current = tickKey;

      if (anim.time > 0 && tick.time < anim.time) {
        return;
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

  // Register fast callback
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
        <div className="absolute top-10 left-3 pointer-events-auto z-10 flex flex-col gap-1 text-[11px] font-mono select-none">
          {indicators.showSma20 && (
            <div className="group flex items-center gap-1.5 text-amber-500 font-medium bg-white/70 dark:bg-slate-900/70 backdrop-blur-xs px-1.5 py-0.5 rounded border border-slate-200/50 dark:border-slate-800/50 shadow-xs">
              <span className="w-2 h-0.5 bg-amber-500 inline-block shrink-0" />
              <span>SMA {indicators.smaPeriod ?? 20}</span>
              {onConfigureIndicator && (
                <button
                  type="button"
                  onClick={() => onConfigureIndicator('sma')}
                  title="Configure SMA parameters"
                  className="opacity-0 group-hover:opacity-100 hover:text-amber-400 p-0.5 rounded transition-opacity cursor-pointer"
                >
                  <Settings className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
          {indicators.showEma50 && (
            <div className="group flex items-center gap-1.5 text-blue-500 font-medium bg-white/70 dark:bg-slate-900/70 backdrop-blur-xs px-1.5 py-0.5 rounded border border-slate-200/50 dark:border-slate-800/50 shadow-xs">
              <span className="w-2 h-0.5 bg-blue-500 inline-block shrink-0" />
              <span>EMA {indicators.emaPeriod ?? 50}</span>
              {onConfigureIndicator && (
                <button
                  type="button"
                  onClick={() => onConfigureIndicator('ema')}
                  title="Configure EMA parameters"
                  className="opacity-0 group-hover:opacity-100 hover:text-blue-400 p-0.5 rounded transition-opacity cursor-pointer"
                >
                  <Settings className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
          {indicators.showBollingerBands && (
            <div className="group flex items-center gap-1.5 text-purple-400 font-medium bg-white/70 dark:bg-slate-900/70 backdrop-blur-xs px-1.5 py-0.5 rounded border border-slate-200/50 dark:border-slate-800/50 shadow-xs">
              <span className="w-2 h-0.5 bg-purple-400 inline-block shrink-0" />
              <span>BB ({indicators.bbPeriod ?? 20}, {indicators.bbStdDev ?? 2})</span>
              {onConfigureIndicator && (
                <button
                  type="button"
                  onClick={() => onConfigureIndicator('bb')}
                  title="Configure Bollinger Bands parameters"
                  className="opacity-0 group-hover:opacity-100 hover:text-purple-300 p-0.5 rounded transition-opacity cursor-pointer"
                >
                  <Settings className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
          {indicators.showVolume && (
            <div className="flex items-center gap-1.5 text-slate-400 font-medium bg-white/70 dark:bg-slate-900/70 backdrop-blur-xs px-1.5 py-0.5 rounded border border-slate-200/50 dark:border-slate-800/50 shadow-xs">
              <span className="w-2 h-2 rounded-xs bg-slate-400/40 inline-block shrink-0" />
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
