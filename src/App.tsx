import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  AlertCircle,
  CandlestickChart,
  RefreshCw,
} from 'lucide-react';
import {
  ChartTheme,
  ChartType,
  FormattedCandle,
  IndicatorSettings,
  LegendValues,
  BinomoApiResponse,
  LiveTick,
} from './types';
import {
  DEFAULT_BINOMO_URL,
  DEFAULT_INTERVAL,
  DEFAULT_ASSET,
  fetchBinomoCandles,
  buildBinomoUrl,
  getBinomoDatetimeForInterval,
} from './services/binomoApi';
import { useRealtimeBinomo } from './services/useRealtimeBinomo';
import { TradingViewChart } from './components/TradingViewChart';
import { ChartHeader } from './components/ChartHeader';
import { IndicatorsMenu } from './components/IndicatorsMenu';
import { IndicatorSettingsModal } from './components/IndicatorSettingsModal';
import { ApiModal } from './components/ApiModal';
import { MarketStatsBar } from './components/MarketStatsBar';
import { PineEditor } from './components/PineEditor';
import { PineExecutionResult } from './types/pine';
import { executePineScript } from './utils/pineEngine';

export default function App() {
  const [candles, setCandles] = useState<FormattedCandle[]>([]);
  const [rawResponse, setRawResponse] = useState<BinomoApiResponse | null>(null);
  const [targetUrl, setTargetUrl] = useState<string>(DEFAULT_BINOMO_URL);
  const [currentTimeframe, setCurrentTimeframe] = useState<number>(DEFAULT_INTERVAL);
  const [chartType, setChartType] = useState<ChartType>('candlestick');
  const [theme, setTheme] = useState<ChartTheme>('dark');
  const [indicators, setIndicators] = useState<IndicatorSettings>({
    showSma20: false,
    smaPeriod: 20,
    showEma50: false,
    emaPeriod: 50,
    showBollingerBands: false,
    bbPeriod: 20,
    bbStdDev: 2,
    showVolume: true,
    showHighLowLevels: true,
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isIndicatorsOpen, setIsIndicatorsOpen] = useState<boolean>(false);
  const [indicatorSettingsTarget, setIndicatorSettingsTarget] = useState<'sma' | 'ema' | 'bb' | null>(null);
  const [isIndicatorSettingsOpen, setIsIndicatorSettingsOpen] = useState<boolean>(false);
  const [isApiModalOpen, setIsApiModalOpen] = useState<boolean>(false);
  const [isPineEditorOpen, setIsPineEditorOpen] = useState<boolean>(false);
  const [pineResult, setPineResult] = useState<PineExecutionResult | null>(null);
  const [activePineCode, setActivePineCode] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [currentLegend, setCurrentLegend] = useState<LegendValues | null>(null);

  // States and refs for historical candle pagination/auto-loading
  const [isHistoryLoading, setIsHistoryLoading] = useState<boolean>(false);
  const exhaustedChunksRef = useRef<Set<string>>(new Set());

  const resetZoomRef = useRef<(() => void) | null>(null);
  const fastTickRef = useRef<((tick: LiveTick) => void) | null>(null);
  const appContainerRef = useRef<HTMLDivElement>(null);
  const candlesRef = useRef<FormattedCandle[]>([]);
  const activeTimeframeRef = useRef<number>(DEFAULT_INTERVAL);
  activeTimeframeRef.current = currentTimeframe;

  // Sync dark class with DOM
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Preline UI dynamic initialization
  useEffect(() => {
    // @ts-ignore
    import('preline');
  }, []);

  useEffect(() => {
    try {
      (window as any).HSStaticMethods?.autoInit?.();
    } catch {
      // Ignore initial render ticks before Preline module resolves
    }
  }, [isIndicatorsOpen, isApiModalOpen, isPineEditorOpen]);

  const [customAppliedUrl, setCustomAppliedUrl] = useState<string | null>(null);

  // Load candles from Binomo API (Historical baseline)
  const loadCandles = useCallback(
    async (isBackground = false) => {
      const requestedInterval = currentTimeframe;
      if (!isBackground) {
        setIsLoading(true);
      }
      setError(null);

      try {
        const result = await fetchBinomoCandles({
          interval: requestedInterval,
          customUrl: customAppliedUrl || undefined,
        });

        // Guard against race conditions if user rapidly switched timeframe while fetch was in flight
        if (activeTimeframeRef.current !== requestedInterval) {
          return;
        }

        if (isBackground) {
          // If background sync returned fallback synthetic data while we already have candles, DO NOT pollute
          if (result.rawResponse?._meta?.isFallback) {
            return;
          }

          const existingList = candlesRef.current;

          // Map synced candles for rapid key matching
          const syncedMap = new Map(result.candles.map((c) => [c.time, c]));
          
          // Update details for overlapping candles, otherwise keep historical ones intact
          const updatedExisting = existingList.map((c) => {
            const synced = syncedMap.get(c.time);
            return synced ? synced : c;
          });
          
          // Track and append truly brand-new candles from the live stream chunk
          const existingTimes = new Set(existingList.map((c) => c.time));
          const brandNew = result.candles.filter((c) => !existingTimes.has(c.time));
          
          const combined = [...updatedExisting, ...brandNew];
          combined.sort((a, b) => a.time - b.time);
          
          candlesRef.current = combined;
          setCandles(combined);
        } else {
          // Initial baseline load or hard refresh
          candlesRef.current = result.candles;
          setCandles(result.candles);
        }

        setRawResponse(result.rawResponse);
        if (result.targetUrl) {
          setTargetUrl(result.targetUrl);
        }
        setLastUpdated(new Date());
      } catch (err: unknown) {
        if (activeTimeframeRef.current === requestedInterval) {
          const message = err instanceof Error ? err.message : 'Error fetching candle data';
          console.error('Failed to load Binomo candles:', err);
          setError(message);
        }
      } finally {
        if (activeTimeframeRef.current === requestedInterval) {
          setIsLoading(false);
        }
      }
    },
    [currentTimeframe, customAppliedUrl]
  );

  // Initial load of candle history
  useEffect(() => {
    loadCandles(false);
  }, [loadCandles]);

  // Automatic silent background reconciliation with Binomo exchange periodically
  useEffect(() => {
    const syncTimer = setInterval(() => {
      loadCandles(true);
    }, 30000);
    return () => clearInterval(syncTimer);
  }, [loadCandles]);

  // Safe key identifying market candle data changes and timeframe switches
  const candleDataVersion =
    candles.length > 0
      ? `${currentTimeframe}_${candles.length}_${candles[0]?.time}_${candles[candles.length - 1]?.time}`
      : '';

  // Keep Pine Script calculations updated whenever candles update, timeframe changes, or active script changes
  useEffect(() => {
    if (activePineCode && candles && candles.length > 0 && !isLoading) {
      try {
        const res = executePineScript(activePineCode, candles, currentTimeframe);
        setPineResult(res);
      } catch (err) {
        console.warn('Pine Script re-execution warning:', err);
      }
    }
  }, [candleDataVersion, activePineCode, currentTimeframe, isLoading]);

  // Handle clearing the Pine script result when activePineCode becomes falsy
  useEffect(() => {
    if (!activePineCode) {
      setPineResult(null);
    }
  }, [activePineCode]);

  const handleLegendChange = useCallback((values: LegendValues | null) => {
    setCurrentLegend(values);
  }, []);

  // Real-time live 1ms stream hook
  const {
    status: realtimeStatus,
    intervalMs,
    setIntervalMs,
    latestTick,
    tickCount,
    ticksPerSec,
    latencyMs,
    isPaused: isRealtimePaused,
    togglePause: toggleRealtimePause,
  } = useRealtimeBinomo({
    enabled: true,
    initialIntervalMs: 500,
    timeframeSeconds: currentTimeframe,
    initialCandles: candles,
    onTick: (tick) => {
      try {
        // Only dispatch and append ticks if the current dataset is ready
        fastTickRef.current?.(tick);

        const list = candlesRef.current;
        if (list && list.length > 0) {
          const last = list[list.length - 1];
          if (last && last.time === tick.time) {
            last.open = tick.open;
            last.close = tick.close;
            last.high = Math.max(last.high, tick.high);
            last.low = Math.min(last.low, tick.low);
            last.volume = tick.volume;
          } else if (last && tick.time > last.time) {
            list.push({
              time: tick.time,
              open: tick.open,
              high: tick.high,
              low: tick.low,
              close: tick.close,
              volume: tick.volume,
            });
            setCandles([...list]);
          }
        }
      } catch (err) {
        console.warn('Real-time tick processing notice:', err);
      }
    },
  });

  // Fullscreen toggle
  const handleToggleFullscreen = () => {
    try {
      if (!document.fullscreenElement) {
        if (appContainerRef.current?.requestFullscreen) {
          appContainerRef.current
            .requestFullscreen()
            .then(() => {
              setIsFullscreen(true);
            })
            .catch(() => {});
        }
      } else {
        if (document.exitFullscreen) {
          document
            .exitFullscreen()
            .then(() => {
              setIsFullscreen(false);
            })
            .catch(() => {});
        }
      }
    } catch {}
  };

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const loadOlderCandles = useCallback(async () => {
    if (isHistoryLoading || isLoading) return;

    const currentList = candlesRef.current;
    if (!currentList || currentList.length < 10) return;
    const oldestCandle = currentList[0];
    if (!oldestCandle) return;

    const oldestTime = oldestCandle.time;

    const currentChunkDate = getBinomoDatetimeForInterval(currentTimeframe, new Date(oldestTime * 1000));
    const currentChunkUtc = new Date(currentChunkDate + 'Z');
    const prevTime = currentChunkUtc.getTime() - 1000;
    const prevChunkDate = getBinomoDatetimeForInterval(currentTimeframe, new Date(prevTime));

    const chunkKey = `${currentTimeframe}_${prevChunkDate}`;
    if (exhaustedChunksRef.current.has(chunkKey)) {
      return;
    }

    setIsHistoryLoading(true);

    try {
      const result = await fetchBinomoCandles({
        interval: currentTimeframe,
        date: prevChunkDate,
      });

      const newCandles = result.candles;

      if (!newCandles || newCandles.length === 0) {
        exhaustedChunksRef.current.add(chunkKey);
        setIsHistoryLoading(false);
        return;
      }

      const latestList = candlesRef.current;
      const existingTimes = new Set(latestList.map((c) => c.time));
      const filteredNew = newCandles.filter((c) => !existingTimes.has(c.time));

      if (filteredNew.length === 0) {
        exhaustedChunksRef.current.add(chunkKey);
        setIsHistoryLoading(false);
        return;
      }

      const combined = [...filteredNew, ...latestList];
      combined.sort((a, b) => a.time - b.time);

      candlesRef.current = combined;
      setCandles(combined);
    } catch (err) {
      console.error('Error fetching older candle chunk:', err);
      exhaustedChunksRef.current.add(chunkKey);
    } finally {
      setIsHistoryLoading(false);
    }
  }, [currentTimeframe, isHistoryLoading, isLoading]);

  const handleTimeframeChange = (seconds: number) => {
    if (seconds === currentTimeframe) return;
    exhaustedChunksRef.current.clear();
    setCurrentTimeframe(seconds);
    setCustomAppliedUrl(null);
    setPineResult(null);
    setIsLoading(true);
    const newUrl = buildBinomoUrl(DEFAULT_ASSET, seconds);
    setTargetUrl(newUrl);
  };

  const handleApplyCustomUrl = (url: string) => {
    exhaustedChunksRef.current.clear();
    setCustomAppliedUrl(url);
    setTargetUrl(url);
  };

  return (
    <div
      ref={appContainerRef}
      id="tradingview-app-root"
      className={`w-screen h-screen flex flex-col overflow-hidden ${
        theme === 'dark' ? 'dark bg-[#131722] text-[#d1d4dc]' : 'bg-[#ffffff] text-slate-900'
      }`}
    >
      {/* Top TradingView Chart Header */}
      <ChartHeader
        assetSymbol={DEFAULT_ASSET}
        candles={candles}
        chartType={chartType}
        onChartTypeChange={setChartType}
        currentTimeframe={currentTimeframe}
        onTimeframeChange={handleTimeframeChange}
        theme={theme}
        onThemeToggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        indicators={indicators}
        onOpenIndicators={() => setIsIndicatorsOpen(true)}
        onOpenPineEditor={() => setIsPineEditorOpen((prev) => !prev)}
        hasActivePineScript={!!pineResult?.success}
        onOpenApiModal={() => setIsApiModalOpen(true)}
        onRefresh={() => loadCandles(false)}
        onResetZoom={() => resetZoomRef.current?.()}
        isLoading={isLoading}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        realtimeStatus={realtimeStatus}
        tickCount={tickCount}
        ticksPerSec={ticksPerSec}
        latencyMs={latencyMs}
        updateIntervalMs={intervalMs}
        onIntervalChange={setIntervalMs}
        isRealtimePaused={isRealtimePaused}
        onToggleRealtimePause={toggleRealtimePause}
      />

      {/* Main Chart Area */}
      <main id="chart-viewport" className="relative flex-1 w-full flex flex-col overflow-hidden min-h-0">
        {/* Error Banner if any */}
        {error && (
          <div
            id="chart-error-banner"
            className="absolute top-4 left-1/2 -translate-x-1/2 z-40 max-w-lg w-11/12 p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 backdrop-blur-md text-rose-600 dark:text-rose-400 text-xs flex items-center justify-between shadow-lg"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              id="retry-fetch-btn"
              onClick={() => loadCandles(false)}
              className="px-2.5 py-1 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-medium shrink-0 ml-2 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Initial Loading Spinner */}
        {isLoading && candles.length === 0 && (
          <div
            id="chart-loading-overlay"
            className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white/80 dark:bg-[#131722]/80 backdrop-blur-xs"
          >
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                <CandlestickChart className="w-4 h-4 text-blue-400 absolute inset-0 m-auto" />
              </div>
              <div className="text-center font-mono">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Loading Binomo TradingView Chart...
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-xs truncate">
                  Connecting to {targetUrl}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TradingView Chart Instance */}
        <TradingViewChart
          candles={candles}
          chartType={chartType}
          theme={theme}
          indicators={indicators}
          assetSymbol={DEFAULT_ASSET}
          currentTimeframe={currentTimeframe}
          liveTick={latestTick}
          onFastTickRef={fastTickRef}
          onLegendChange={handleLegendChange}
          onResetZoomRef={resetZoomRef}
          pineResult={pineResult}
          onRemovePineScript={() => setPineResult(null)}
          onOpenPineEditor={() => setIsPineEditorOpen(true)}
          onConfigureIndicator={(target) => {
            setIndicatorSettingsTarget(target);
            setIsIndicatorSettingsOpen(true);
          }}
          isHistoryLoading={isHistoryLoading}
          onLoadMore={loadOlderCandles}
        />
      </main>

      {/* Market Stats & Real-Time Rate Bar */}
      <MarketStatsBar
        candles={candles}
        lastUpdated={lastUpdated}
        targetUrl={targetUrl}
        realtimeStatus={realtimeStatus}
        tickCount={tickCount}
        latencyMs={latencyMs}
        updateIntervalMs={intervalMs}
        ticksPerSec={ticksPerSec}
        isPineEditorOpen={isPineEditorOpen}
        onTogglePineEditor={() => setIsPineEditorOpen((prev) => !prev)}
        hasActivePineScript={!!pineResult?.success}
      />

      {/* TradingView Pine Script v5 Editor & Strategy Tester */}
      <PineEditor
        isOpen={isPineEditorOpen}
        onClose={() => setIsPineEditorOpen(false)}
        candles={candles}
        currentTimeframe={currentTimeframe}
        activeExecutionResult={pineResult}
        onApplyScriptResult={(result, code) => {
          setPineResult(result);
          setActivePineCode(code);
        }}
        theme={theme}
      />

      {/* Technical Indicators Modal */}
      <IndicatorsMenu
        isOpen={isIndicatorsOpen}
        onClose={() => setIsIndicatorsOpen(false)}
        indicators={indicators}
        onChange={setIndicators}
      />

      {/* Indicator Parameter Settings Modal */}
      <IndicatorSettingsModal
        isOpen={isIndicatorSettingsOpen}
        onClose={() => setIsIndicatorSettingsOpen(false)}
        indicators={indicators}
        targetIndicator={indicatorSettingsTarget}
        onSave={setIndicators}
      />

      {/* Binomo API Inspector Modal */}
      <ApiModal
        isOpen={isApiModalOpen}
        onClose={() => setIsApiModalOpen(false)}
        currentUrl={targetUrl}
        rawResponse={rawResponse}
        onApplyCustomUrl={handleApplyCustomUrl}
      />
    </div>
  );
}
