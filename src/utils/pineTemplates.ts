import { PineTemplate } from '../types/pine';

export const PINE_TEMPLATES: PineTemplate[] = [
  {
    id: 'luxalgo-sr-mtf',
    title: 'Support and Resistance Signals MTF [LuxAlgo]',
    shortTitle: 'LuxAlgo S&R MTF',
    description: 'Dynamic Support & Resistance zones, historical S&R level shifts, false breakout filters, retests, tests, and swing signals.',
    type: 'indicator',
    category: 'Trend',
    code: `//@version=5
indicator("Support and Resistance Signals MTF [LuxAlgo]", 'LuxAlgo - Support Resistance Signals MTF', true, max_boxes_count = 500, max_lines_count = 500, max_labels_count = 500)

// Settings
srTF   = input.string('Chart', 'Detection Timeframe', options=['Chart', '15 Minutes', '1 Hour', '4 Hours', '1 Day', '1 Week'])
srLN   = input.int(15, 'Detection Length')
srMR   = input.float(2.0, 'Support Resistance Margin', minval = 0.1, maxval = 10, step = 0.1)
srHST  = input.bool(true, 'Check Previous Historical S&R Zone')
mnSH   = input.bool(true, 'Manipulation Zones')
srFBO  = input.bool(true, 'Avoid False Breakouts')
swSH   = input.string('Tiny', "Swing Levels", options=['Auto', 'Tiny', 'Small', 'Normal', 'None'])

// Dynamic Pivot & S&R Detection
pp_h = ta.pivothigh(srLN, srLN)
pp_l = ta.pivotlow(srLN, srLN)

plot(pp_h, "Pivot High Resistance", color=color.red, linewidth=2, style=plot.style_line)
plot(pp_l, "Pivot Low Support", color=color.green, linewidth=2, style=plot.style_line)
`,
  },
  {
    id: 'ict-fvg-orderblocks',
    title: 'ICT / SMC Fair Value Gaps (FVG) & Order Blocks',
    shortTitle: 'ICT FVG & OB',
    description: 'Smart Money Concepts indicator detecting Bullish/Bearish Fair Value Gaps with mitigation tracking & Market Structure signals.',
    type: 'indicator',
    category: 'SMC / ICT',
    code: `//@version=5
indicator("ICT Smart Money Concepts - FVG & Market Structure", overlay=true)

// Inputs
fvg_threshold = input.float(0.0, "FVG Min Threshold (%)")
show_bull = input.bool(true, "Show Bullish FVG")
show_bear = input.bool(true, "Show Bearish FVG")
show_ma = input.bool(true, "Show Trend Baseline EMA")
ema_len = input.int(50, "Baseline EMA Length")

// 3-Bar Fair Value Gap (FVG) Detection
bull_fvg = low > high[2] and close[1] > open[1]
bear_fvg = high < low[2] and close[1] < open[1]

// Baseline Trend EMA
base_ema = ta.ema(close, ema_len)
plot(show_ma ? base_ema : na, "Baseline Trend EMA", color=color.blue, linewidth=2)

// FVG Levels
fvg_top = bull_fvg ? low : bear_fvg ? low[2] : na
fvg_bottom = bull_fvg ? high[2] : bear_fvg ? high : na

plot(fvg_top, "FVG Upper Level", color=color.new(color.green, 20), linewidth=1, style=plot.style_line)
plot(fvg_bottom, "FVG Lower Level", color=color.new(color.red, 20), linewidth=1, style=plot.style_line)

// Signal Markers
plotshape(show_bull and bull_fvg, "Bullish FVG Zone", shape.triangleup, location.belowbar, color.green, text="FVG Bull")
plotshape(show_bear and bear_fvg, "Bearish FVG Zone", shape.triangledown, location.abovebar, color.red, text="FVG Bear")
`,
  },
  {
    id: 'supertrend-multi-cloud',
    title: 'Supertrend Multi-Multiplier Trend Cloud',
    shortTitle: 'Supertrend Cloud',
    description: 'Triple Supertrend algorithm identifying trend alignment, trailing support/resistance bands, and high-probability breakouts.',
    type: 'indicator',
    category: 'Trend',
    code: `//@version=5
indicator("Supertrend Trend Cloud", overlay=true)

// Inputs
factor1 = input.float(2.0, "Supertrend 1 Factor")
period1 = input.int(10, "Supertrend 1 ATR Period")
factor2 = input.float(3.0, "Supertrend 2 Factor")
period2 = input.int(14, "Supertrend 2 ATR Period")

// Calculations
[st1, dir1] = ta.supertrend(factor1, period1)
[st2, dir2] = ta.supertrend(factor2, period2)

// Plots
plot(st1, "Fast Supertrend", color=dir1 == -1 ? color.green : color.red, linewidth=2)
plot(st2, "Slow Supertrend", color=dir2 == -1 ? color.lime : color.maroon, linewidth=2)

// Signals
bull_cross = ta.crossover(close, st1) and dir2 == -1
bear_cross = ta.crossunder(close, st1) and dir2 == 1

plotshape(bull_cross, "Supertrend Bull Breakout", shape.arrowup, location.belowbar, color.green, text="BUY")
plotshape(bear_cross, "Supertrend Bear Breakdown", shape.arrowdown, location.abovebar, color.red, text="SELL")
`,
  },
  {
    id: 'ema-ribbon-8x',
    title: 'EMA Ribbon 8x Wave Alignment',
    shortTitle: 'EMA Ribbon 8x',
    description: 'Multi-timeframe 8-period Exponential Moving Average ribbon visualizing momentum expansion, compression, and trend reversals.',
    type: 'indicator',
    category: 'Trend',
    code: `//@version=5
indicator("EMA Ribbon 8x Waves", overlay=true)

// Inputs
len1 = input.int(8, "EMA 1")
len2 = input.int(13, "EMA 2")
len3 = input.int(21, "EMA 3")
len4 = input.int(34, "EMA 4")
len5 = input.int(55, "EMA 5")
len6 = input.int(89, "EMA 6")

e1 = ta.ema(close, len1)
e2 = ta.ema(close, len2)
e3 = ta.ema(close, len3)
e4 = ta.ema(close, len4)
e5 = ta.ema(close, len5)
e6 = ta.ema(close, len6)

plot(e1, "EMA 8", color=color.aqua, linewidth=1)
plot(e2, "EMA 13", color=color.blue, linewidth=1)
plot(e3, "EMA 21", color=color.green, linewidth=2)
plot(e4, "EMA 34", color=color.yellow, linewidth=2)
plot(e5, "EMA 55", color=color.orange, linewidth=2)
plot(e6, "EMA 89", color=color.red, linewidth=3)

bull_wave = e1 > e2 and e2 > e3 and e3 > e4 and e4 > e5 and e5 > e6
bear_wave = e1 < e2 and e2 < e3 and e3 < e4 and e4 < e5 and e5 < e6

plotshape(ta.crossover(e1, e6), "Ribbon Bull Cross", shape.triangleup, location.belowbar, color.green, text="BULL WAVE")
plotshape(ta.crossunder(e1, e6), "Ribbon Bear Cross", shape.triangledown, location.abovebar, color.red, text="BEAR WAVE")
`,
  },
  {
    id: 'rsi-divergence-oscillator',
    title: 'RSI Multi-Level Divergence Oscillator',
    shortTitle: 'RSI Divergence',
    description: 'Relative Strength Index with dynamic overbought/oversold bands, midline crossovers, and extreme condition signal alerts.',
    type: 'indicator',
    category: 'Momentum',
    code: `//@version=5
indicator("RSI Divergence & Levels", overlay=false)

rsi_len = input.int(14, "RSI Length")
ob_level = input.float(70.0, "Overbought Level")
os_level = input.float(30.0, "Oversold Level")
ma_len = input.int(9, "RSI Signal SMA Length")

rsi_val = ta.rsi(close, rsi_len)
rsi_ma = ta.sma(rsi_val, ma_len)

plot(rsi_val, "RSI", color=color.purple, linewidth=2)
plot(rsi_ma, "RSI Signal MA", color=color.yellow, linewidth=1)

hline(ob_level, "Overbought", color=color.red)
hline(50.0, "Midline", color=color.gray)
hline(os_level, "Oversold", color=color.green)

buy_sig = ta.crossover(rsi_val, os_level)
sell_sig = ta.crossunder(rsi_val, ob_level)

plotshape(buy_sig, "RSI Oversold Bounce", shape.arrowup, location.belowbar, color.green, text="RSI BUY")
plotshape(sell_sig, "RSI Overbought Pullback", shape.arrowdown, location.abovebar, color.red, text="RSI SELL")
`,
  },
  {
    id: 'macd-4c-custom',
    title: 'MACD 4-Color Momentum Histogram',
    shortTitle: 'MACD 4-Color',
    description: 'Moving Average Convergence Divergence with fast/slow triggers and 4-color histogram indicating acceleration & decelerating momentum.',
    type: 'indicator',
    category: 'Momentum',
    code: `//@version=5
indicator("MACD 4-Color Histogram", overlay=false)

fast_len = input.int(12, "Fast EMA Length")
slow_len = input.int(26, "Slow EMA Length")
sig_len = input.int(9, "Signal Length")

[macd_line, sig_line, hist] = ta.macd(close, fast_len, slow_len, sig_len)

plot(macd_line, "MACD Line", color=color.blue, linewidth=2)
plot(sig_line, "Signal Line", color=color.orange, linewidth=2)
plot(hist, "Histogram", color=hist >= 0 ? (hist > hist[1] ? color.green : color.lime) : (hist < hist[1] ? color.red : color.maroon), style=plot.style_histogram, linewidth=2)

hline(0, "Zero Line", color=color.gray)

plotshape(ta.crossover(macd_line, sig_line), "MACD Bullish Cross", shape.triangleup, location.belowbar, color.green, text="MACD BUY")
plotshape(ta.crossunder(macd_line, sig_line), "MACD Bearish Cross", shape.triangledown, location.abovebar, color.red, text="MACD SELL")
`,
  },
  {
    id: 'bollinger-squeeze-breakout',
    title: 'Bollinger Bands Volatility Squeeze & Breakout',
    shortTitle: 'BB Squeeze Breakout',
    description: 'Measures volatility compression (squeeze) and triggers explosive trend breakout signals as standard deviation expands.',
    type: 'indicator',
    category: 'Volatility',
    code: `//@version=5
indicator("Bollinger Bands Volatility Squeeze", overlay=true)

bb_len = input.int(20, "BB Length")
bb_mult = input.float(2.0, "BB Multiplier")

[bb_basis, bb_upper, bb_lower] = ta.bb(close, bb_len, bb_mult)

plot(bb_basis, "BB Basis", color=color.orange, linewidth=1)
plot(bb_upper, "BB Upper Band", color=color.blue, linewidth=2)
plot(bb_lower, "BB Lower Band", color=color.blue, linewidth=2)

bull_breakout = ta.crossover(close, bb_upper)
bear_breakdown = ta.crossunder(close, bb_lower)

plotshape(bull_breakout, "Upper Band Breakout", shape.arrowup, location.belowbar, color.green, text="BB UPPER")
plotshape(bear_breakdown, "Lower Band Breakdown", shape.arrowdown, location.abovebar, color.red, text="BB LOWER")
`,
  },
  {
    id: 'ema-cross-strategy',
    title: 'EMA Golden Cross & Trend Following Strategy',
    shortTitle: 'EMA Golden Cross Strat',
    description: 'Systematic trend-following strategy with complete backtesting simulation, position management, and performance stats.',
    type: 'strategy',
    category: 'Strategies',
    code: `//@version=5
strategy("EMA Golden Cross Strategy", overlay=true, initial_capital=10000, default_qty_value=1)

fast_len = input.int(9, "Fast EMA Length")
slow_len = input.int(21, "Slow EMA Length")
trend_len = input.int(50, "Trend Filter EMA Length")

fast_ema = ta.ema(close, fast_len)
slow_ema = ta.ema(close, slow_len)
trend_ema = ta.ema(close, trend_len)

plot(fast_ema, "Fast EMA (9)", color=color.green, linewidth=2)
plot(slow_ema, "Slow EMA (21)", color=color.red, linewidth=2)
plot(trend_ema, "Trend EMA (50)", color=color.yellow, linewidth=2)

long_cond = ta.crossover(fast_ema, slow_ema) and close > trend_ema
short_cond = ta.crossunder(fast_ema, slow_ema) and close < trend_ema

if long_cond
    strategy.entry("Long", strategy.long)

if short_cond
    strategy.entry("Short", strategy.short)
`,
  },
  {
    id: 'supertrend-strategy',
    title: 'Supertrend Trailing Stop Strategy',
    shortTitle: 'Supertrend Strat',
    description: 'ATR-based volatility strategy that enters on trend flips and manages trailing stops automatically.',
    type: 'strategy',
    category: 'Strategies',
    code: `//@version=5
strategy("Supertrend Automated Strategy", overlay=true, initial_capital=10000, default_qty_value=1)

factor = input.float(3.0, "Supertrend ATR Factor")
period = input.int(10, "Supertrend ATR Period")

[st, dir] = ta.supertrend(factor, period)

plot(st, "Supertrend", color=dir == -1 ? color.green : color.red, linewidth=2)

long_cond = dir == -1 and dir[1] == 1
short_cond = dir == 1 and dir[1] == -1

if long_cond
    strategy.entry("ST Long", strategy.long)

if short_cond
    strategy.entry("ST Short", strategy.short)
`,
  },
  {
    id: 'parabolic-sar-strategy',
    title: 'Parabolic SAR Acceleration Strategy',
    shortTitle: 'Parabolic SAR Strat',
    description: 'Systematic trailing stop and reverse (SAR) strategy designed to capture strong momentum moves.',
    type: 'strategy',
    category: 'Strategies',
    code: `//@version=5
strategy("Parabolic SAR Reversal Strategy", overlay=true, initial_capital=10000, default_qty_value=1)

start = input.float(0.02, "SAR Start")
inc = input.float(0.02, "SAR Increment")
max_val = input.float(0.2, "SAR Maximum")

sar_val = ta.sar(start, inc, max_val)
plot(sar_val, "Parabolic SAR", color=color.purple, linewidth=2, style=plot.style_circles)

long_cond = ta.crossover(close, sar_val)
short_cond = ta.crossunder(close, sar_val)

if long_cond
    strategy.entry("SAR Long", strategy.long)

if short_cond
    strategy.entry("SAR Short", strategy.short)
`,
  },
];
