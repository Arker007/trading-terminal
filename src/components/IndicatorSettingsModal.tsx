import React, { useState, useEffect } from 'react';
import { Settings, Sliders, Check } from 'lucide-react';
import { IndicatorSettings } from '../types';
import { Modal } from './shared/Modal';
import { Button } from './shared/Button';

interface IndicatorSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  indicators: IndicatorSettings;
  onSave: (updated: IndicatorSettings) => void;
  targetIndicator?: 'sma' | 'ema' | 'bb' | null;
}

export const IndicatorSettingsModal: React.FC<IndicatorSettingsModalProps> = ({
  isOpen,
  onClose,
  indicators,
  onSave,
  targetIndicator = null,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'sma' | 'ema' | 'bb'>(targetIndicator || 'bb');

  // Local editable state
  const [smaPeriod, setSmaPeriod] = useState<number>(indicators.smaPeriod ?? 20);
  const [emaPeriod, setEmaPeriod] = useState<number>(indicators.emaPeriod ?? 50);
  const [bbPeriod, setBbPeriod] = useState<number>(indicators.bbPeriod ?? 20);
  const [bbStdDev, setBbStdDev] = useState<number>(indicators.bbStdDev ?? 2);

  // Sync state whenever modal opens or target changes
  useEffect(() => {
    if (isOpen) {
      setSmaPeriod(indicators.smaPeriod ?? 20);
      setEmaPeriod(indicators.emaPeriod ?? 50);
      setBbPeriod(indicators.bbPeriod ?? 20);
      setBbStdDev(indicators.bbStdDev ?? 2);
      if (targetIndicator) {
        setActiveTab(targetIndicator);
      }
    }
  }, [isOpen, targetIndicator, indicators]);

  if (!isOpen) return null;

  const handleApply = () => {
    // Validate inputs
    const validSma = Math.max(1, Math.min(500, Math.round(Number(smaPeriod) || 20)));
    const validEma = Math.max(1, Math.min(500, Math.round(Number(emaPeriod) || 50)));
    const validBbPeriod = Math.max(2, Math.min(500, Math.round(Number(bbPeriod) || 20)));
    const validBbStdDev = Math.max(0.1, Math.min(10, Number(bbStdDev) || 2));

    onSave({
      ...indicators,
      smaPeriod: validSma,
      emaPeriod: validEma,
      bbPeriod: validBbPeriod,
      bbStdDev: validBbStdDev,
    });
    onClose();
  };

  const handleResetDefaults = () => {
    if (activeTab === 'bb' || activeTab === 'all') {
      setBbPeriod(20);
      setBbStdDev(2);
    }
    if (activeTab === 'sma' || activeTab === 'all') {
      setSmaPeriod(20);
    }
    if (activeTab === 'ema' || activeTab === 'all') {
      setEmaPeriod(50);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Indicator Settings"
      id="indicator-settings-modal"
      icon={
        <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
          <Settings className="w-4 h-4" />
        </div>
      }
      footerActions={
        <div className="flex w-full items-center justify-between">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline cursor-pointer"
          >
            Reset Defaults
          </button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button id="btn-save-indicator-settings" variant="primary" size="sm" onClick={handleApply}>
              Apply Changes
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Indicator selection tabs */}
        <div className="flex items-center gap-1 border-b border-gray-200 dark:border-neutral-700 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('bb')}
            className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
              activeTab === 'bb'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Bollinger Bands (BB)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sma')}
            className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
              activeTab === 'sma'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            SMA
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ema')}
            className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
              activeTab === 'ema'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            EMA
          </button>
        </div>

        {/* Tab 1: Bollinger Bands */}
        {activeTab === 'bb' && (
          <div className="space-y-3.5">
            <div className="flex items-center justify-between pb-1">
              <div>
                <h4 className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" />
                  Bollinger Bands Parameters
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-neutral-400">
                  Calculates moving average benchmark and standard deviation envelope bands.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-neutral-800/60 p-3 rounded-lg border border-slate-200 dark:border-neutral-700">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Length / Period
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={2}
                    max={200}
                    step={1}
                    value={bbPeriod}
                    onChange={(e) => setBbPeriod(Math.max(2, parseInt(e.target.value) || 2))}
                    className="w-full text-xs font-mono font-semibold px-2.5 py-1.5 rounded border border-slate-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Default: 20 periods</span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  StdDev (Multiplier)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0.5}
                    max={6}
                    step={0.1}
                    value={bbStdDev}
                    onChange={(e) => setBbStdDev(parseFloat(e.target.value) || 2)}
                    className="w-full text-xs font-mono font-semibold px-2.5 py-1.5 rounded border border-slate-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Default: 2 standard deviations</span>
              </div>
            </div>

            {/* Quick Presets for BB */}
            <div>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-neutral-400 block mb-1.5">
                Quick Presets:
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { label: 'Standard (20, 2)', period: 20, dev: 2 },
                  { label: 'Fast Scalp (10, 1.5)', period: 10, dev: 1.5 },
                  { label: 'Tight Bounds (20, 1.5)', period: 20, dev: 1.5 },
                  { label: 'Wide Filter (30, 2.5)', period: 30, dev: 2.5 },
                  { label: 'Extreme (50, 3)', period: 50, dev: 3 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setBbPeriod(preset.period);
                      setBbStdDev(preset.dev);
                    }}
                    className={`text-[11px] px-2 py-1 rounded border transition-colors cursor-pointer ${
                      bbPeriod === preset.period && bbStdDev === preset.dev
                        ? 'bg-purple-500/10 border-purple-500 text-purple-400 font-bold'
                        : 'border-slate-300 dark:border-neutral-700 hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: SMA */}
        {activeTab === 'sma' && (
          <div className="space-y-3.5">
            <div>
              <h4 className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                Simple Moving Average (SMA) Parameters
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-neutral-400">
                Smoothes candle closing prices over the specified number of periods.
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-neutral-800/60 p-3 rounded-lg border border-slate-200 dark:border-neutral-700 max-w-sm">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                SMA Length / Period
              </label>
              <input
                type="number"
                min={2}
                max={500}
                step={1}
                value={smaPeriod}
                onChange={(e) => setSmaPeriod(Math.max(1, parseInt(e.target.value) || 20))}
                className="w-full text-xs font-mono font-semibold px-2.5 py-1.5 rounded border border-slate-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Default: 20 periods</span>
            </div>

            {/* Quick Presets for SMA */}
            <div>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-neutral-400 block mb-1.5">
                Quick Presets:
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {[9, 14, 20, 50, 100, 200].map((len) => (
                  <button
                    key={len}
                    type="button"
                    onClick={() => setSmaPeriod(len)}
                    className={`text-[11px] px-2.5 py-1 rounded border transition-colors cursor-pointer ${
                      smaPeriod === len
                        ? 'bg-amber-500/10 border-amber-500 text-amber-500 font-bold'
                        : 'border-slate-300 dark:border-neutral-700 hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    SMA {len}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: EMA */}
        {activeTab === 'ema' && (
          <div className="space-y-3.5">
            <div>
              <h4 className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                Exponential Moving Average (EMA) Parameters
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-neutral-400">
                Gives exponentially higher weighting to recent price bars for reactive trend tracking.
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-neutral-800/60 p-3 rounded-lg border border-slate-200 dark:border-neutral-700 max-w-sm">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                EMA Length / Period
              </label>
              <input
                type="number"
                min={2}
                max={500}
                step={1}
                value={emaPeriod}
                onChange={(e) => setEmaPeriod(Math.max(1, parseInt(e.target.value) || 50))}
                className="w-full text-xs font-mono font-semibold px-2.5 py-1.5 rounded border border-slate-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Default: 50 periods</span>
            </div>

            {/* Quick Presets for EMA */}
            <div>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-neutral-400 block mb-1.5">
                Quick Presets:
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {[9, 21, 50, 100, 200].map((len) => (
                  <button
                    key={len}
                    type="button"
                    onClick={() => setEmaPeriod(len)}
                    className={`text-[11px] px-2.5 py-1 rounded border transition-colors cursor-pointer ${
                      emaPeriod === len
                        ? 'bg-blue-500/10 border-blue-500 text-blue-500 font-bold'
                        : 'border-slate-300 dark:border-neutral-700 hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    EMA {len}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
