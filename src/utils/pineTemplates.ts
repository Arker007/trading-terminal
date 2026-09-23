import { PineTemplate } from '../types/pine';

export const PINE_TEMPLATES: PineTemplate[] = [
  {
    id: 'custom-indicator',
    title: 'Custom Indicator Starter (SMA + EMA + Signals)',
    shortTitle: 'SMA + EMA Signals',
    description: 'A clean starting template with customizable moving averages, crossover signal markers, and reference lines.',
    type: 'indicator',
    category: 'Custom',
    code: `//@version=5
indicator("My Custom Pine Script", overlay=true)

// Input settings
lenFast = input(9, "Fast Length")
lenSlow = input(21, "Slow Length")

// Indicator Calculations
maFast = ta.ema(close, lenFast)
maSlow = ta.sma(close, lenSlow)

// Signal Conditions
buySignal = ta.crossover(maFast, maSlow)
sellSignal = ta.crossunder(maFast, maSlow)

// Plot Lines
plot(maFast, "Fast EMA", color=color.green, linewidth=2)
plot(maSlow, "Slow SMA", color=color.orange, linewidth=2)

// Plot Visual Markers
plotshape(buySignal, title="Buy Signal", style=shape.triangleup, location=location.belowbar, color=color.green, text="BUY")
plotshape(sellSignal, title="Sell Signal", style=shape.triangledown, location=location.abovebar, color=color.red, text="SELL")
`,
  },
  {
    id: 'ema-cross-strategy',
    title: 'EMA Golden Cross & Ribbon Strategy',
    shortTitle: 'EMA Ribbon Strategy',
    description: 'Trend-following strategy using Fast (9) and Slow (21) Exponential Moving Average crossovers with automated backtest statistics.',
    type: 'strategy',
    category: 'Strategies',
    code: `//@version=5
strategy("EMA Cross Strategy", overlay=true, initial_capital=1000, default_qty_value=100)

// Fast & Slow EMA Inputs
fastLength = input(9, "Fast EMA Length")
slowLength = input(21, "Slow EMA Length")
trendLength = input(50, "Trend Filter EMA")

// Calculations
emaFast = ta.ema(close, fastLength)
emaSlow = ta.ema(close, slowLength)
emaTrend = ta.ema(close, trendLength)

// Entry Conditions
bullishCross = ta.crossover(emaFast, emaSlow) and close > emaTrend
bearishCross = ta.crossunder(emaFast, emaSlow) and close < emaTrend

// Execution
if (bullishCross)
    strategy.entry("Long", strategy.long)

if (bearishCross)
    strategy.entry("Short", strategy.short)

// Chart Visuals
plot(emaFast, "Fast EMA (9)", color=color.rgb(34, 197, 94), linewidth=2)
plot(emaSlow, "Slow EMA (21)", color=color.rgb(239, 68, 68), linewidth=2)
plot(emaTrend, "Trend EMA (50)", color=color.rgb(59, 130, 246), linewidth=1)

plotshape(bullishCross, title="Buy Signal", style=shape.triangleup, location=location.belowbar, color=color.green, text="BUY")
plotshape(bearishCross, title="Sell Signal", style=shape.triangledown, location=location.abovebar, color=color.red, text="SELL")
`,
  },
  {
    id: 'supertrend-pro',
    title: 'SuperTrend Trend Tracker',
    shortTitle: 'SuperTrend Pro',
    description: 'ATR volatility-based trend reversal detector that plots active support/resistance trendlines.',
    type: 'indicator',
    category: 'Trend',
    code: `//@version=5
indicator("SuperTrend Pro", overlay=true)

factor = input(3.0, "ATR Factor")
atrPeriod = input(10, "ATR Period")

[supertrend, direction] = ta.supertrend(factor, atrPeriod)

// Render dynamic colored trendline
plot(direction < 0 ? supertrend : na, "Up Trend", color=color.rgb(34, 197, 94), linewidth=2)
plot(direction > 0 ? supertrend : na, "Down Trend", color=color.rgb(239, 68, 68), linewidth=2)

// Signal flags
trendReversalUp = ta.crossover(direction, 0)
trendReversalDown = ta.crossunder(direction, 0)

plotshape(trendReversalUp, title="Bullish SuperTrend", style=shape.triangleup, location=location.belowbar, color=color.green, text="ST BULL")
plotshape(trendReversalDown, title="Bearish SuperTrend", style=shape.triangledown, location=location.abovebar, color=color.red, text="ST BEAR")
`,
  },
  {
    id: 'rsi-divergence',
    title: 'RSI Multi-Level Oscillator',
    shortTitle: 'RSI Oscillator',
    description: 'Relative Strength Index momentum oscillator with Overbought (70) and Oversold (30) levels.',
    type: 'indicator',
    category: 'Momentum',
    code: `//@version=5
indicator("Relative Strength Index", overlay=false)

rsiLength = input(14, "RSI Period")
rsiSource = input(close, "Source")

rsiVal = ta.rsi(rsiSource, rsiLength)
rsiMa = ta.sma(rsiVal, 9)

plot(rsiVal, "RSI Line", color=color.rgb(168, 85, 247), linewidth=2)
plot(rsiMa, "RSI Signal MA", color=color.rgb(245, 158, 11), linewidth=1)

hline(70, "Overbought", color=color.rgb(239, 68, 68), linestyle=hline.style_dashed)
hline(50, "Neutral Midline", color=color.rgb(148, 163, 184), linestyle=hline.style_dotted)
hline(30, "Oversold", color=color.rgb(34, 197, 94), linestyle=hline.style_dashed)
`,
  },
  {
    id: 'bollinger-breakout',
    title: 'Bollinger Bands & Mean Reversion Strategy',
    shortTitle: 'Bollinger Bands',
    description: 'Standard deviation volatility envelopes with buy on lower band dip and sell on upper band touch.',
    type: 'strategy',
    category: 'Strategies',
    code: `//@version=5
strategy("Bollinger Bands Strategy", overlay=true, initial_capital=1000)

length = input(20, "BB Length")
mult = input(2.0, "StdDev Multiplier")

[basis, upper, lower] = ta.bb(close, length, mult)

// Long on touch of lower band, Short on touch of upper band
buySignal = ta.crossover(close, lower)
sellSignal = ta.crossunder(close, upper)

if (buySignal)
    strategy.entry("BB Long", strategy.long)

if (sellSignal)
    strategy.entry("BB Short", strategy.short)

plot(upper, "Upper Band", color=color.rgb(168, 85, 247), linewidth=1)
plot(basis, "Basis (SMA 20)", color=color.rgb(245, 158, 11), linewidth=1)
plot(lower, "Lower Band", color=color.rgb(168, 85, 247), linewidth=1)

plotshape(buySignal, title="BB Buy", style=shape.triangleup, location=location.belowbar, color=color.green, text="BB BUY")
plotshape(sellSignal, title="BB Sell", style=shape.triangledown, location=location.abovebar, color=color.red, text="BB SELL")
`,
  },
  {
    id: 'macd-pro',
    title: 'MACD Momentum Oscillator',
    shortTitle: 'MACD Pro',
    description: 'Moving Average Convergence Divergence with MACD line, 9-period Signal line, and color-coded momentum histogram.',
    type: 'indicator',
    category: 'Momentum',
    code: `//@version=5
indicator("MACD Pro", overlay=false)

fastLen = input(12, "Fast Length")
slowLen = input(26, "Slow Length")
sigLen = input(9, "Signal Length")

[macdLine, signalLine, hist] = ta.macd(close, fastLen, slowLen, sigLen)

plot(macdLine, "MACD", color=color.rgb(59, 130, 246), linewidth=2)
plot(signalLine, "Signal", color=color.rgb(245, 158, 11), linewidth=2)
plot(hist, "Histogram", color=hist >= 0 ? color.green : color.red, linewidth=3, style=plot.style_histogram)

hline(0, "Zero Line", color=color.rgb(148, 163, 184), linestyle=hline.style_dotted)
`,
  },
  {
    id: 'binomo-scalper-breakout',
    title: 'Binomo Crypto Scalper (Fast Momentum)',
    shortTitle: 'Crypto Scalper',
    description: 'Engineered specifically for fast Crypto IDX candles using rapid price breakouts and volume confirmation.',
    type: 'strategy',
    category: 'Strategies',
    code: `//@version=5
strategy("Binomo Crypto Scalper", overlay=true, initial_capital=500)

emaShort = ta.ema(close, 5)
emaMid = ta.ema(close, 13)
emaLong = ta.ema(close, 34)

// Momentum trigger
bullTrigger = ta.crossover(emaShort, emaMid) and close > emaLong
bearTrigger = ta.crossunder(emaShort, emaMid) and close < emaLong

if (bullTrigger)
    strategy.entry("Scalp Long", strategy.long)

if (bearTrigger)
    strategy.entry("Scalp Short", strategy.short)

plot(emaShort, "EMA 5 (Fast)", color=color.rgb(6, 182, 212), linewidth=2)
plot(emaMid, "EMA 13", color=color.rgb(234, 179, 8), linewidth=1)
plot(emaLong, "EMA 34 (Baseline)", color=color.rgb(244, 63, 94), linewidth=2)

plotshape(bullTrigger, title="Scalp Long", style=shape.triangleup, location=location.belowbar, color=color.green, text="SCALP UP")
plotshape(bearTrigger, title="Scalp Short", style=shape.triangledown, location=location.abovebar, color=color.red, text="SCALP DOWN")
`,
  },
  {
    id: 'stoch-cross',
    title: 'Stochastic Oscillator & Cross Signals',
    shortTitle: 'Stoch Cross',
    description: 'Classic %K and %D Stochastic oscillator with crossover markers, overbought (80), and oversold (20) levels.',
    type: 'indicator',
    category: 'Momentum',
    code: `//@version=5
indicator("Stoch Cross", overlay=true)

periodK = input(14, "%K Length")
periodD = input(3, "%D Smoothing")
smoothK = input(3, "%K Smoothing")

rawStoch = ta.stoch(close, high, low, periodK)
k = ta.sma(rawStoch, smoothK)
d = ta.sma(k, periodD)

crossUp = ta.crossover(k, d) and k < 30
crossDown = ta.crossunder(k, d) and k > 70

plot(k, "%K Line", color=color.blue, linewidth=2)
plot(d, "%D Line", color=color.orange, linewidth=2)

hline(80, "Overbought", color=color.red, linestyle=hline.style_dashed)
hline(50, "Midline", color=color.gray, linestyle=hline.style_dotted)
hline(20, "Oversold", color=color.green, linestyle=hline.style_dashed)

plotshape(crossUp, title="Bullish Stoch Cross", style=shape.triangleup, location=location.belowbar, color=color.green, text="STOCH BUY")
plotshape(crossDown, title="Bearish Stoch Cross", style=shape.triangledown, location=location.abovebar, color=color.red, text="STOCH SELL")
`,
  },
  {
    id: 'custom-starter',
    title: 'Custom Indicator Boilerplate',
    shortTitle: 'Boilerplate',
    description: 'Clean Pine Script template to build custom indicators, math formulas, and signals.',
    type: 'indicator',
    category: 'Custom',
    code: `//@version=5
indicator("My Custom Indicator", overlay=true)

// Inputs
length = input(14, "Lookback Period")
src = input(close, "Source")

// Calculation
smaVal = ta.sma(src, length)
emaVal = ta.ema(src, length)

// Plots
plot(smaVal, "SMA", color=color.yellow, linewidth=2)
plot(emaVal, "EMA", color=color.cyan, linewidth=2)
`,
  },
];
