import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  BarChart2,
  CandlestickChart,
  Code2,
  Maximize2,
  Minimize2,
  Moon,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Sliders,
  Sun,
  TrendingDown,
  TrendingUp,
  Wifi,
  WifiOff,
  Zap,
  ZoomIn,
} from 'lucide-react';
import {
  ChartTheme,
  ChartType,
  FormattedCandle,
  IndicatorSettings,
  LegendValues,
  RealtimeStatus,
  TimeframeOption,
  UpdateIntervalOption,
} from '../types';
import { formatPrice } from '../utils/indicators';
import { Button } from './shared/Button';
import { Badge } from './shared/Badge';
import { Tooltip } from './shared/Tooltip';

interface ChartHeaderProps {
  assetSymbol: string;
  candles: FormattedCandle[];
  chartType: ChartType;
  onChartTypeChange: (type: ChartType) => void;
  currentTimeframe: number;
  onTimeframeChange: (seconds: number) => void;
  theme: ChartTheme;
  onThemeToggle: () => void;
  indicators: IndicatorSettings;
  onOpenIndicators: () => void;
  onOpenPineEditor?: () => void;
  hasActivePineScript?: boolean;
  onOpenApiModal: () => void;
  onRefresh: () => void;
  onResetZoom: () => void;
  isLoading: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  // Real-time properties
  realtimeStatus: RealtimeStatus;
  tickCount: number;
  ticksPerSec: number;
  latencyMs: number;
  updateIntervalMs: UpdateIntervalOption;
  onIntervalChange: (interval: UpdateIntervalOption) => void;
  isRealtimePaused: boolean;
  onToggleRealtimePause: () => void;
}

export const TIMEFRAMES: TimeframeOption[] = [
  { label: '5s', value: 5, description: '5 Seconds' },
  { label: '15s', value: 15, description: '15 Seconds' },
  { label: '30s', value: 30, description: '30 Seconds' },
  { label: '1m', value: 60, description: '1 Minute (Target API)' },
  { label: '5m', value: 300, description: '5 Minutes' },
  { label: '15m', value: 900, description: '15 Minutes' },
  { label: '1h', value: 3600, description: '1 Hour' },
];

export const INTERVAL_OPTIONS: { label: string; value: UpdateIntervalOption; desc: string }[] = [
  { label: '500ms', value: 500, desc: 'Steady Real-Time (2 updates/sec)' },
  { label: '100ms', value: 100, desc: 'Smooth Real-Time (10 updates/sec)' },
  { label: '50ms', value: 50, desc: '20 updates/sec' },
  { label: '10ms', value: 10, desc: '100 updates/sec' },
  { label: '1ms', value: 1, desc: 'Ultra High-Frequency (1,000 updates/sec)' },
  { label: '1s', value: 1000, desc: '1 second standard interval' },
];

export const ChartHeader: React.FC<ChartHeaderProps> = ({
  assetSymbol,
  candles,
  chartType,
  onChartTypeChange,
  currentTimeframe,
  onTimeframeChange,
  theme,
  onThemeToggle,
  indicators,
  onOpenIndicators,
  onOpenPineEditor,
  hasActivePineScript = false,
  onOpenApiModal,
  onRefresh,
  onResetZoom,
  isLoading,
  isFullscreen,
  onToggleFullscreen,
  realtimeStatus,
  tickCount,
  ticksPerSec,
  latencyMs,
  updateIntervalMs,
  onIntervalChange,
  isRealtimePaused,
  onToggleRealtimePause,
}) => {
  const lastCandle = candles[candles.length - 1];
  const firstCandle = candles[0];
  const currentPrice = lastCandle?.close || 0;

  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);
  const prevPriceRef = useRef<number>(currentPrice);

  useEffect(() => {
    if (prevPriceRef.current && currentPrice !== prevPriceRef.current) {
      if (currentPrice > prevPriceRef.current) {
        setPriceFlash('up');
      } else {
        setPriceFlash('down');
      }
      prevPriceRef.current = currentPrice;
      const t = setTimeout(() => setPriceFlash(null), 350);
      return () => clearTimeout(t);
    }
    prevPriceRef.current = currentPrice;
  }, [currentPrice]);

  const sessionChange = lastCandle && firstCandle ? lastCandle.close - firstCandle.open : 0;
  const sessionPercent = firstCandle && firstCandle.open !== 0 ? (sessionChange / firstCandle.open) * 100 : 0;
  const isPositive = sessionChange >= 0;

  const activeIndicatorsCount = Object.values(indicators).filter(Boolean).length;

  return (
    <header
      id="tradingview-chart-header"
      className="w-full flex flex-wrap items-center justify-between px-3 py-1.5 border-b transition-colors duration-150 border-slate-200 dark:border-[#2a2e39] bg-white dark:bg-[#1e222d] text-slate-800 dark:text-[#d1d4dc] gap-2 select-none"
    >
      {/* Left section: Ticker, Price & 1ms Real-Time Status */}
      <div className="flex items-center gap-2.5 flex-wrap">
        {/* Symbol badge */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center font-bold text-xs">
            IDX
          </div>
          <div>
            <div className="flex items-center gap-1.5 leading-none">
              <span className="font-bold text-sm tracking-tight">{assetSymbol}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-sm uppercase tracking-wider font-semibold bg-slate-100 dark:bg-[#2a2e39] text-slate-500 dark:text-slate-400">
                Binomo Crypto
              </span>
            </div>
          </div>
        </div>

        {/* Live Current Price with Flash effect */}
        {lastCandle && (
          <div className="flex items-baseline gap-2 pl-2 border-l border-slate-200 dark:border-[#2a2e39]">
            <div
              className={`font-mono tabular-nums text-lg font-bold tracking-tight px-1.5 py-0.2 rounded transition-colors duration-150 min-w-[135px] text-center ${
                priceFlash === 'up'
                  ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                  : priceFlash === 'down'
                  ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                  : ''
              }`}
            >
              {formatPrice(currentPrice)}
            </div>
            <div
              className={`hidden sm:flex items-center text-xs font-mono font-medium tabular-nums min-w-[175px] ${
                isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {isPositive ? <TrendingUp className="w-3 h-3 mr-0.5 shrink-0" /> : <TrendingDown className="w-3 h-3 mr-0.5 shrink-0" />}
              <span className="truncate">
                {sessionChange >= 0 ? '+' : ''}
                {formatPrice(sessionChange)} ({sessionPercent >= 0 ? '+' : ''}
                {sessionPercent.toFixed(2)}%)
              </span>
            </div>
          </div>
        )}

        {/* Real-time Streaming & 1ms Status Badge */}
        <div className="flex items-center gap-1 pl-1">
          <button
            id="btn-toggle-realtime"
            onClick={onToggleRealtimePause}
            title={isRealtimePaused ? 'Resume Real-time Stream' : 'Pause Real-time Stream'}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-mono font-medium border transition-all cursor-pointer ${
              realtimeStatus === 'connected' && !isRealtimePaused
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
                : isRealtimePaused
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
                : 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400'
            }`}
          >
            {realtimeStatus === 'connected' && !isRealtimePaused ? (
              <>
                <Zap className="w-3 h-3 text-emerald-500 animate-pulse" />
                <span className="font-semibold text-[11px] tracking-wider">
                  {updateIntervalMs === 1 ? '1ms LIVE' : `${updateIntervalMs}ms LIVE`}
                </span>
                <Pause className="w-3 h-3 ml-0.5 opacity-60 hover:opacity-100" />
              </>
            ) : isRealtimePaused ? (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="font-semibold text-[11px] tracking-wider">PAUSED</span>
                <Play className="w-3 h-3 ml-0.5 opacity-80 hover:opacity-100" />
              </>
            ) : (
              <>
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span className="font-semibold text-[11px] tracking-wider">CONNECTING</span>
              </>
            )}
          </button>

          {/* Tick Rate Display (e.g. ~1,000/s) */}
          {!isRealtimePaused && (
            <span
              id="live-tick-rate-badge"
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-semibold"
              title="Real-time chart updates per second"
            >
              {ticksPerSec > 0 ? `${ticksPerSec.toLocaleString()} ticks/s` : updateIntervalMs === 1 ? '1,000 ticks/s' : `${Math.round(1000 / updateIntervalMs)} ticks/s`}
            </span>
          )}

          {tickCount > 0 && (
            <span
              className="hidden lg:inline text-[10px] font-mono text-slate-400 dark:text-slate-500 px-1"
              title="Total accumulated high-frequency ticks"
            >
              {tickCount.toLocaleString()} ticks
            </span>
          )}
        </div>

        {/* 1ms Speed Selector */}
        <div
          id="speed-selector"
          className="flex items-center p-1 rounded-lg border border-slate-200 dark:border-[#2a2e39] bg-slate-100 dark:bg-[#131722]"
        >
          <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 px-2 uppercase tracking-wider">
            Interval:
          </span>
          {INTERVAL_OPTIONS.map((opt) => (
            <Tooltip key={opt.value} content={opt.desc}>
              <button
                id={`speed-btn-${opt.label}`}
                onClick={() => onIntervalChange(opt.value)}
                className={`px-3 py-1 text-xs font-mono rounded-md transition-colors cursor-pointer ${
                  updateIntervalMs === opt.value
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            </Tooltip>
          ))}
        </div>
      </div>

      {/* Middle section: Timeframe & Chart Style toggles */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Timeframe Buttons */}
        <div
          id="timeframe-selector"
          className="flex items-center p-1 rounded-lg border border-slate-200 dark:border-[#2a2e39] bg-slate-100 dark:bg-[#131722]"
        >
          {TIMEFRAMES.map((tf) => (
            <Tooltip key={tf.value} content={tf.description}>
              <button
                id={`timeframe-btn-${tf.label}`}
                onClick={() => onTimeframeChange(tf.value)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  currentTimeframe === tf.value
                    ? 'bg-blue-600 text-white shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tf.label}
              </button>
            </Tooltip>
          ))}
        </div>

        {/* Chart Style Selector */}
        <div
          id="chart-type-selector"
          className="flex items-center p-1 rounded-lg border border-slate-200 dark:border-[#2a2e39] bg-slate-100 dark:bg-[#131722]"
        >
          <Tooltip content="Candlestick Chart">
            <button
              id="chart-type-candlestick"
              onClick={() => onChartTypeChange('candlestick')}
              className={`px-3 py-1.5 text-xs rounded-md flex items-center gap-1.5 transition-colors cursor-pointer ${
                chartType === 'candlestick'
                  ? 'bg-blue-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <CandlestickChart className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Candles</span>
            </button>
          </Tooltip>

          <Tooltip content="Hollow Candles Chart">
            <button
              id="chart-type-hollow"
              onClick={() => onChartTypeChange('hollow')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors cursor-pointer ${
                chartType === 'hollow'
                  ? 'bg-blue-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Hollow
            </button>
          </Tooltip>

          <Tooltip content="Bar (OHLC) Chart">
            <button
              id="chart-type-bar"
              onClick={() => onChartTypeChange('bar')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors cursor-pointer ${
                chartType === 'bar'
                  ? 'bg-blue-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Bar
            </button>
          </Tooltip>

          <Tooltip content="Line Chart">
            <button
              id="chart-type-line"
              onClick={() => onChartTypeChange('line')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors cursor-pointer ${
                chartType === 'line'
                  ? 'bg-blue-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Line
            </button>
          </Tooltip>

          <Tooltip content="Area Chart">
            <button
              id="chart-type-area"
              onClick={() => onChartTypeChange('area')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors cursor-pointer ${
                chartType === 'area'
                  ? 'bg-blue-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Area
            </button>
          </Tooltip>
        </div>

        {/* Indicators Trigger */}
        <Tooltip content="Add & Configure Technical Indicators">
          <button
            id="btn-indicators-modal"
            onClick={onOpenIndicators}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2a2e39] bg-slate-50 dark:bg-[#131722] hover:bg-slate-100 dark:hover:bg-[#2a2e39] text-slate-750 dark:text-[#d1d4dc] transition-colors cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5 text-blue-500" />
            <span>Indicators</span>
            {activeIndicatorsCount > 0 && (
              <Badge variant="primary" className="py-0 px-1.5 text-[10px] min-w-4 h-4 flex items-center justify-center font-bold">
                {activeIndicatorsCount}
              </Badge>
            )}
          </button>
        </Tooltip>

        {/* Pine Editor Trigger */}
        {onOpenPineEditor && (
          <Tooltip content="Open Pine Script v5 Editor & Strategy Tester">
            <button
              id="btn-pine-editor-modal"
              onClick={onOpenPineEditor}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                hasActivePineScript
                  ? 'border-blue-500/40 bg-blue-500/10 text-blue-500 font-bold'
                  : 'border-slate-200 dark:border-[#2a2e39] bg-slate-50 dark:bg-[#131722] hover:bg-slate-100 dark:hover:bg-[#2a2e39] text-slate-700 dark:text-[#d1d4dc]'
              }`}
            >
              <Code2 className="w-3.5 h-3.5 text-blue-500" />
              <span>Pine Editor</span>
              {hasActivePineScript && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </button>
          </Tooltip>
        )}
      </div>

      {/* Right section: Actions (Fit zoom, Reload history, API inspect, Theme, Fullscreen) */}
      <div className="flex items-center gap-2">
        {/* Reset Zoom / Fit Content */}
        <Tooltip content="Reset Zoom / Fit to Screen">
          <button
            id="btn-fit-chart"
            onClick={onResetZoom}
            className="p-2 rounded-lg border border-slate-200 dark:border-[#2a2e39] hover:bg-slate-100 dark:hover:bg-[#2a2e39] text-slate-600 dark:text-slate-400 transition-colors cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </Tooltip>

        {/* Manual Refresh History button */}
        <Tooltip content="Reload Full History from API">
          <button
            id="btn-manual-refresh"
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 rounded-lg border border-slate-200 dark:border-[#2a2e39] hover:bg-slate-100 dark:hover:bg-[#2a2e39] text-slate-600 dark:text-slate-400 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-500' : ''}`} />
          </button>
        </Tooltip>

        {/* API Endpoint Inspector Button */}
        <Tooltip content="Inspect Binomo API Request & Payload">
          <button
            id="btn-open-api-modal"
            onClick={onOpenApiModal}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer"
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>API</span>
          </button>
        </Tooltip>

        {/* Theme Toggle (Dark / Light) */}
        <Tooltip content={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
          <button
            id="btn-theme-toggle"
            onClick={onThemeToggle}
            className="p-2 rounded-lg border border-slate-200 dark:border-[#2a2e39] hover:bg-slate-100 dark:hover:bg-[#2a2e39] text-slate-600 dark:text-slate-400 transition-colors cursor-pointer"
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-600" />}
          </button>
        </Tooltip>

        {/* Fullscreen Toggle */}
        <Tooltip content={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
          <button
            id="btn-toggle-fullscreen"
            onClick={onToggleFullscreen}
            className="p-2 rounded-lg border border-slate-200 dark:border-[#2a2e39] hover:bg-slate-100 dark:hover:bg-[#2a2e39] text-slate-600 dark:text-slate-400 transition-colors cursor-pointer"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </Tooltip>
      </div>
    </header>
  );
};
