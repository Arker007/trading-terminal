import React from 'react';
import { Activity, Clock, Database, Globe, Layers, Code, BarChart2 } from 'lucide-react';
import { FormattedCandle } from '../types';
import { formatPrice } from '../utils/indicators';
import { Badge } from './shared/Badge';

interface MarketStatsBarProps {
  candles: FormattedCandle[];
  lastUpdated: Date | null;
  targetUrl: string;
  realtimeStatus?: string;
  tickCount?: number;
  latencyMs?: number;
  updateIntervalMs?: number;
  ticksPerSec?: number;
  isPineEditorOpen?: boolean;
  onTogglePineEditor?: () => void;
  hasActivePineScript?: boolean;
}

export const MarketStatsBar: React.FC<MarketStatsBarProps> = ({
  candles,
  lastUpdated,
  targetUrl,
  realtimeStatus,
  tickCount = 0,
  latencyMs = 0,
  updateIntervalMs = 1,
  ticksPerSec = 0,
  isPineEditorOpen = false,
  onTogglePineEditor,
  hasActivePineScript = false,
}) => {
  if (!candles || candles.length === 0) return null;

  const highest = Math.max(...candles.map((c) => c.high));
  const lowest = Math.min(...candles.map((c) => c.low));
  const spread = highest - lowest;

  const bullishCount = candles.filter((c) => c.close >= c.open).length;
  const bearishCount = candles.length - bullishCount;
  const bullRatio = candles.length > 0 ? Math.round((bullishCount / candles.length) * 100) : 50;

  const firstTime = new Date(candles[0].time * 1000).toISOString().replace('.000Z', ' UTC');
  const lastTime = new Date(candles[candles.length - 1].time * 1000).toISOString().replace('.000Z', ' UTC');

  return (
    <footer
      id="market-stats-bar"
      className="w-full px-3 py-1.5 border-t border-slate-200 dark:border-[#2a2e39] bg-slate-50 dark:bg-[#1e222d] text-slate-600 dark:text-[#848e9c] text-xs flex flex-wrap items-center justify-between gap-2 font-mono select-none"
    >
      {/* Left items: TradingView bottom dock tabs */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {onTogglePineEditor && (
          <button
            id="btn-bottom-pine-editor"
            onClick={onTogglePineEditor}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${
              isPineEditorOpen
                ? 'bg-blue-600 text-white shadow-xs font-bold'
                : hasActivePineScript
                ? 'bg-blue-500/15 text-blue-500 border border-blue-500/30 hover:bg-blue-500/25'
                : 'hover:bg-slate-200 dark:hover:bg-[#2a2e39] text-slate-700 dark:text-slate-300'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Pine Editor</span>
            {hasActivePineScript && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>
        )}

        <div className="w-[1px] h-3.5 bg-slate-300 dark:bg-slate-700 mx-1 hidden sm:block" />

        <div className="flex items-center gap-1.5 text-[11px]">
          <Database className="w-3 h-3 text-blue-500" />
          <span>{candles.length} Bars</span>
        </div>

        <div className="hidden lg:flex items-center gap-1 text-[11px] text-slate-400">
          <span>({firstTime.split('T')[1]?.slice(0, 5)} - {lastTime.split('T')[1]?.slice(0, 5)})</span>
        </div>
      </div>

      {/* Center items: High, Low, Spread, Bull/Bear */}
      <div className="flex items-center gap-3 flex-wrap text-[11px]">
        <div className="flex items-center gap-1">
          <span className="text-slate-400">H:</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-bold">{formatPrice(highest)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-slate-400">L:</span>
          <span className="text-rose-600 dark:text-rose-400 font-bold">{formatPrice(lowest)}</span>
        </div>
        <div className="hidden md:flex items-center gap-1">
          <span className="text-slate-400">Range:</span>
          <span className="text-slate-800 dark:text-slate-200 font-semibold">{formatPrice(spread)}</span>
        </div>
        <div className="hidden xl:flex items-center gap-1.5" title={`${bullishCount} Green / ${bearishCount} Red`}>
          <span className="text-slate-400">B/B:</span>
          <div className="w-12 h-1.5 rounded-full overflow-hidden bg-rose-500 flex">
            <div className="bg-emerald-500 h-full" style={{ width: `${bullRatio}%` }} />
          </div>
          <span className="text-[10px] text-slate-400">{bullRatio}%</span>
        </div>
      </div>

      {/* Right items: Connected status & latency */}
      <div className="flex items-center gap-2.5 text-[11px]">
        <Badge variant={realtimeStatus === 'connected' ? 'success' : 'warning'} className="gap-x-1 font-mono py-0.5 px-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              realtimeStatus === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'
            }`} />
            <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
              realtimeStatus === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'
            }`} />
          </span>
          <span>{realtimeStatus === 'connected' ? 'Live' : 'Paused'}</span>
        </Badge>

        {tickCount > 0 && (
          <span className="hidden sm:inline text-slate-400">
            {updateIntervalMs}ms engine &bull; {tickCount.toLocaleString()} ticks
          </span>
        )}
      </div>
    </footer>
  );
};

