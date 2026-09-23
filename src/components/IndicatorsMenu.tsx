import React, { useState } from 'react';
import { Check, Sliders, Settings } from 'lucide-react';
import { IndicatorSettings } from '../types';
import { Modal } from './shared/Modal';
import { Button } from './shared/Button';
import { IndicatorSettingsModal } from './IndicatorSettingsModal';

interface IndicatorsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  indicators: IndicatorSettings;
  onChange: (updated: IndicatorSettings) => void;
}

export const IndicatorsMenu: React.FC<IndicatorsMenuProps> = ({
  isOpen,
  onClose,
  indicators,
  onChange,
}) => {
  const [settingsTarget, setSettingsTarget] = useState<'sma' | 'ema' | 'bb' | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  const toggle = (key: keyof IndicatorSettings) => {
    onChange({
      ...indicators,
      [key]: !indicators[key],
    });
  };

  const handleOpenSettings = (e: React.MouseEvent, target: 'sma' | 'ema' | 'bb') => {
    e.stopPropagation();
    setSettingsTarget(target);
    setIsSettingsOpen(true);
  };

  const smaPeriod = indicators.smaPeriod ?? 20;
  const emaPeriod = indicators.emaPeriod ?? 50;
  const bbPeriod = indicators.bbPeriod ?? 20;
  const bbStdDev = indicators.bbStdDev ?? 2;

  const list = [
    {
      key: 'showSma20' as const,
      settingTarget: 'sma' as const,
      name: `SMA ${smaPeriod} (Simple Moving Average)`,
      desc: `Smoothes price action using the average of the last ${smaPeriod} periods.`,
      badgeColor: 'bg-amber-500',
    },
    {
      key: 'showEma50' as const,
      settingTarget: 'ema' as const,
      name: `EMA ${emaPeriod} (Exponential Moving Average)`,
      desc: `Weights recent prices more heavily to reveal underlying momentum (period: ${emaPeriod}).`,
      badgeColor: 'bg-blue-600',
    },
    {
      key: 'showBollingerBands' as const,
      settingTarget: 'bb' as const,
      name: `Bollinger Bands (${bbPeriod}, ${bbStdDev})`,
      desc: `Identifies volatility bounds using standard deviation bands (length: ${bbPeriod}, stdDev: ${bbStdDev}).`,
      badgeColor: 'bg-purple-500',
    },
    {
      key: 'showVolume' as const,
      name: 'Volume / Volatility Activity',
      desc: 'Displays candle tick activity and price range magnitude histogram.',
      badgeColor: 'bg-emerald-500',
    },
    {
      key: 'showHighLowLevels' as const,
      name: 'Session High / Low Price Lines',
      desc: 'Visualizes dynamic horizontal benchmark levels for max and min prices.',
      badgeColor: 'bg-rose-500',
    },
  ];

  const activeCount = [
    indicators.showSma20,
    indicators.showEma50,
    indicators.showBollingerBands,
    indicators.showVolume,
    indicators.showHighLowLevels,
  ].filter(Boolean).length;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Technical Indicators"
        id="indicators-modal"
        icon={
          <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
            <Sliders className="w-4 h-4" />
          </div>
        }
        footerActions={
          <div className="flex w-full items-center justify-between">
            <span className="text-gray-500 dark:text-neutral-400 text-xs">
              {activeCount} of {list.length} indicators active
            </span>
            <Button id="done-indicators-btn" variant="primary" size="sm" onClick={onClose}>
              Apply
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          {list.map((item) => {
            const active = indicators[item.key];
            return (
              <div
                key={item.key}
                id={`indicator-toggle-${item.key}`}
                onClick={() => toggle(item.key)}
                className={`flex items-start justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                  active
                    ? 'border-blue-500/50 bg-blue-500/5 dark:bg-blue-500/10'
                    : 'border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800/40'
                }`}
              >
                <div className="pr-4 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${item.badgeColor}`} />
                    <span className="font-medium text-xs text-gray-800 dark:text-neutral-200">
                      {item.name}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-neutral-400 mt-1 pl-4.5">
                    {item.desc}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0 mt-0.5">
                  {/* Settings gear button if customizable */}
                  {'settingTarget' in item && item.settingTarget && (
                    <button
                      type="button"
                      onClick={(e) => handleOpenSettings(e, item.settingTarget!)}
                      title={`Configure ${item.name} parameters`}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-neutral-700 transition-colors"
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <div
                    className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border ${
                      active
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'border-gray-300 dark:border-neutral-600 bg-transparent'
                    }`}
                  >
                    {active && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Modal>

      {/* Embedded Parameter Settings Modal */}
      <IndicatorSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        indicators={indicators}
        targetIndicator={settingsTarget}
        onSave={(updated) => onChange(updated)}
      />
    </>
  );
};
