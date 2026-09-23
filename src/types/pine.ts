export interface PinePlotPoint {
  time: number;
  value: number;
}

export interface PinePlot {
  id: string;
  title: string;
  color: string;
  lineWidth: number;
  style: 'line' | 'histogram' | 'cross' | 'circles' | 'dotted' | 'dashed' | 'columns' | 'stepline' | 'area' | 'areabr';
  data: PinePlotPoint[];
}

export interface PineHLine {
  id: string;
  price: number;
  title: string;
  color: string;
  lineStyle: 'solid' | 'dashed' | 'dotted';
}

export interface PineFill {
  id: string;
  plot1Id: string;
  plot2Id: string;
  color: string;
  title?: string;
}

export interface PineBgColor {
  time: number;
  color: string;
}

export interface PineMarker {
  time: number;
  position: 'aboveBar' | 'belowBar' | 'inBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square' | 'triangleUp' | 'triangleDown' | 'cross' | 'labelUp' | 'labelDown';
  text: string;
  size?: number;
}

export interface PineStrategyTrade {
  id: number;
  tradeId: string;
  type: 'long' | 'short';
  entryTime: number;
  entryPrice: number;
  exitTime?: number;
  exitPrice?: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  status: 'open' | 'closed';
  comment?: string;
}

export interface PineStrategyStats {
  netProfit: number;
  netProfitPercent: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  profitFactor: number;
  initialCapital: number;
  finalEquity: number;
  grossProfit?: number;
  grossLoss?: number;
  avgTradePnl?: number;
}

export interface PineCompileError {
  line: number;
  column?: number;
  message: string;
}

export type PineInputType = 'int' | 'float' | 'bool' | 'string' | 'source' | 'color';

export interface PineInputParam {
  id: string;
  varName: string;
  title: string;
  type: PineInputType;
  defval: any;
  currentVal: any;
  minval?: number;
  maxval?: number;
  step?: number;
  options?: string[] | number[];
  group?: string;
  tooltip?: string;
}

export interface PineExecutionResult {
  success: boolean;
  scriptName: string;
  scriptType: 'indicator' | 'strategy';
  isOverlay: boolean;
  timeframe?: number;
  inputs?: PineInputParam[];
  plots: PinePlot[];
  hlines: PineHLine[];
  fills?: PineFill[];
  bgcolors?: PineBgColor[];
  markers: PineMarker[];
  strategyStats?: PineStrategyStats;
  trades?: PineStrategyTrade[];
  errors: PineCompileError[];
  logs: string[];
  executionTimeMs: number;
}

export interface PineTemplate {
  id: string;
  title: string;
  shortTitle?: string;
  description: string;
  type: 'indicator' | 'strategy';
  category: 'Trend' | 'Momentum' | 'Volatility' | 'SMC / ICT' | 'Volume' | 'Strategies' | 'Custom';
  code: string;
}
