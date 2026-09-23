export interface BinomoRawCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  created_at: string;
}

export interface BinomoApiResponse {
  data: BinomoRawCandle[];
  errors: string[];
  success: boolean;
  _meta?: {
    targetUrl: string;
    fetchedAt: string;
    candleCount: number;
    isFallback?: boolean;
  };
}

export interface FormattedCandle {
  time: number; // in seconds (UTC)
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type ChartType = 'candlestick' | 'hollow' | 'bar' | 'line' | 'area';

export type ChartTheme = 'dark' | 'light';

export interface IndicatorSettings {
  showSma20: boolean;
  smaPeriod?: number;

  showEma50: boolean;
  emaPeriod?: number;

  showBollingerBands: boolean;
  bbPeriod?: number;
  bbStdDev?: number;

  showVolume: boolean;
  showHighLowLevels: boolean;
}

export interface TimeframeOption {
  label: string;
  value: number; // in seconds
  description: string;
}

export interface LegendValues {
  timeStr: string;
  dateStr?: string;
  open: number;
  high: number;
  low: number;
  close: number;
  change: number;
  changePercent: number;
  isUp: boolean;
}

export interface LiveTick {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  created_at: string;
  isNewCandle: boolean;
  tickIndex: number;
  serverTimestamp: number;
}

export type RealtimeStatus = 'connected' | 'connecting' | 'paused' | 'error';

export type UpdateIntervalOption = 1 | 5 | 10 | 50 | 100 | 500 | 1000;

export type PriceScaleModeType = 'normal' | 'logarithmic' | 'percentage';
export type CursorToolType = 'crosshair' | 'dot' | 'arrow';

