export interface PinePlotPoint {
  time: number;
  value: number;
}

export interface PinePlot {
  id: string;
  title: string;
  color: string;
  lineWidth: number;
  style: 'line' | 'histogram' | 'cross' | 'circles' | 'dotted' | 'dashed' | 'columns';
  data: PinePlotPoint[];
}

export interface PineHLine {
  id: string;
  price: number;
  title: string;
  color: string;
  lineStyle: 'solid' | 'dashed' | 'dotted';
}

export interface PineMarker {
  time: number;
  position: 'aboveBar' | 'belowBar' | 'inBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
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
}

export interface PineCompileError {
  line: number;
  column?: number;
  message: string;
}

export interface PineExecutionResult {
  success: boolean;
  scriptName: string;
  scriptType: 'indicator' | 'strategy';
  isOverlay: boolean;
  timeframe?: number;
  plots: PinePlot[];
  hlines: PineHLine[];
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
  category: 'Trend' | 'Momentum' | 'Volatility' | 'Strategies' | 'Custom';
  code: string;
}
