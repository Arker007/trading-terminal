import { FormattedCandle } from '../types';
import {
  PineCompileError,
  PineExecutionResult,
  PineHLine,
  PineMarker,
  PinePlot,
  PineStrategyStats,
  PineStrategyTrade,
} from '../types/pine';

/**
 * Sanitizes and guarantees strictly ascending, deduplicated timestamps and valid numbers for chart rendering.
 */
export function sanitizePlotData(data: { time: number; value: number }[]): { time: number; value: number }[] {
  if (!data || data.length === 0) return [];
  const map = new Map<number, number>();

  for (let i = 0; i < data.length; i++) {
    const pt = data[i];
    if (pt && typeof pt.time === 'number' && !isNaN(pt.time) && typeof pt.value === 'number' && !isNaN(pt.value) && isFinite(pt.value)) {
      map.set(pt.time, pt.value);
    }
  }

  const sortedTimes = Array.from(map.keys()).sort((a, b) => a - b);
  return sortedTimes.map((t) => ({ time: t, value: map.get(t)! }));
}

/**
 * Splits a string by delimiter only when not inside quotes, parentheses, brackets, or braces.
 */
export function splitTopLevel(str: string, delimiter: string = ','): string[] {
  const result: string[] = [];
  let depth = 0;
  let inQuotes = false;
  let quoteChar = '';
  let current = '';

  const isWordDelim = /^[a-zA-Z]+$/.test(delimiter);
  const dLen = delimiter.length;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (inQuotes) {
      current += char;
      if (char === quoteChar && str[i - 1] !== '\\') {
        inQuotes = false;
      }
    } else {
      if (char === '"' || char === "'") {
        inQuotes = true;
        quoteChar = char;
        current += char;
      } else if (char === '(' || char === '[' || char === '{') {
        depth++;
        current += char;
      } else if (char === ')' || char === ']' || char === '}') {
        depth = Math.max(0, depth - 1);
        current += char;
      } else if (depth === 0) {
        if (isWordDelim) {
          const sub = str.substring(i, i + dLen);
          const prevChar = i > 0 ? str[i - 1] : ' ';
          const nextChar = i + dLen < str.length ? str[i + dLen] : ' ';
          const isPrevBoundary = /\s|[(),]/.test(prevChar);
          const isNextBoundary = /\s|[(),]/.test(nextChar);

          if (sub.toLowerCase() === delimiter.toLowerCase() && isPrevBoundary && isNextBoundary) {
            result.push(current.trim());
            current = '';
            i += dLen - 1;
            continue;
          }
        } else if (dLen === 1 && char === delimiter) {
          result.push(current.trim());
          current = '';
          continue;
        } else if (dLen > 1 && str.substring(i, i + dLen) === delimiter) {
          result.push(current.trim());
          current = '';
          i += dLen - 1;
          continue;
        }
        current += char;
      } else {
        current += char;
      }
    }
  }
  if (current.trim()) {
    result.push(current.trim());
  }
  return result;
}

/**
 * Parses function call arguments into positional array and named object dictionary.
 */
export function parseArguments(argsStr: string): { positional: string[]; named: Record<string, string> } {
  const tokens = splitTopLevel(argsStr, ',');
  const positional: string[] = [];
  const named: Record<string, string> = {};

  for (const token of tokens) {
    const eqIdx = token.indexOf('=');
    if (
      eqIdx > 0 &&
      token[eqIdx - 1] !== '!' &&
      token[eqIdx - 1] !== '<' &&
      token[eqIdx - 1] !== '>' &&
      token[eqIdx + 1] !== '='
    ) {
      const key = token.substring(0, eqIdx).trim();
      const val = token.substring(eqIdx + 1).trim();
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
        named[key.toLowerCase()] = val;
        continue;
      }
    }
    positional.push(token);
  }
  return { positional, named };
}

/**
 * Resolves standard Pine Script color names, rgb/rgba or hex strings
 */
export function resolvePineColor(colorStr?: string, defaultGreen = true): string {
  if (!colorStr) return defaultGreen ? '#22c55e' : '#ef4444';
  const c = colorStr.trim().toLowerCase();

  if (c.startsWith('#') || c.startsWith('rgb')) {
    return colorStr.trim().replace(/['"]/g, '');
  }

  // Handle ternary color expression: cond ? col1 : col2
  const qIdx = c.indexOf('?');
  if (qIdx > 0) {
    const colonParts = splitTopLevel(colorStr, ':');
    if (colonParts.length === 2) {
      const qParts = splitTopLevel(colonParts[0], '?');
      if (qParts.length === 2) {
        return resolvePineColor(qParts[1], defaultGreen);
      }
    }
  }

  // Handle color.new(color.red, 50)
  if (c.includes('color.new') || c.includes('color.rgb')) {
    const innerMatch = colorStr.match(/(?:color\.new|color\.rgb)\s*\((.*)\)/i);
    if (innerMatch) {
      const parts = splitTopLevel(innerMatch[1], ',');
      const baseCol = resolvePineColor(parts[0], defaultGreen);
      return baseCol;
    }
  }

  if (c.includes('green') || c.includes('lime')) return '#22c55e';
  if (c.includes('red') || c.includes('maroon')) return '#ef4444';
  if (c.includes('blue') || c.includes('navy')) return '#3b82f6';
  if (c.includes('orange')) return '#f97316';
  if (c.includes('yellow')) return '#eab308';
  if (c.includes('purple')) return '#a855f7';
  if (c.includes('teal') || c.includes('aqua')) return '#14b8a6';
  if (c.includes('gray') || c.includes('grey') || c.includes('silver')) return '#94a3b8';
  if (c.includes('white')) return '#f8fafc';
  if (c.includes('black')) return '#0f172a';

  return defaultGreen ? '#22c55e' : '#ef4444';
}

/**
 * Safe Technical Analysis Calculations
 */
function calcSMA(series: (number | null)[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(series.length).fill(null);
  if (period <= 0 || series.length < period) return result;

  let sum = 0;
  let count = 0;

  for (let i = 0; i < series.length; i++) {
    const v = series[i];
    if (v !== null && !isNaN(v)) {
      sum += v;
      count++;
    }

    if (i >= period) {
      const oldV = series[i - period];
      if (oldV !== null && !isNaN(oldV)) {
        sum -= oldV;
        count--;
      }
    }

    if (i >= period - 1 && count >= period) {
      result[i] = sum / period;
    }
  }
  return result;
}

function calcEMA(series: (number | null)[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(series.length).fill(null);
  if (period <= 0 || series.length < period) return result;

  const k = 2 / (period + 1);
  let initSum = 0;
  let validCount = 0;

  for (let i = 0; i < period && i < series.length; i++) {
    const v = series[i];
    if (v !== null && !isNaN(v)) {
      initSum += v;
      validCount++;
    }
  }

  if (validCount === 0) return result;
  let ema = initSum / validCount;
  result[period - 1] = ema;

  for (let i = period; i < series.length; i++) {
    const v = series[i];
    if (v !== null && !isNaN(v)) {
      ema = v * k + ema * (1 - k);
      result[i] = ema;
    } else {
      result[i] = ema;
    }
  }
  return result;
}

function calcRMA(series: (number | null)[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(series.length).fill(null);
  if (period <= 0 || series.length < period) return result;

  const alpha = 1 / period;
  let initSum = 0;
  let validCount = 0;

  for (let i = 0; i < period && i < series.length; i++) {
    const v = series[i];
    if (v !== null && !isNaN(v)) {
      initSum += v;
      validCount++;
    }
  }

  if (validCount === 0) return result;
  let rma = initSum / validCount;
  result[period - 1] = rma;

  for (let i = period; i < series.length; i++) {
    const v = series[i];
    if (v !== null && !isNaN(v)) {
      rma = alpha * v + (1 - alpha) * rma;
      result[i] = rma;
    } else {
      result[i] = rma;
    }
  }
  return result;
}

function calcWMA(series: (number | null)[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(series.length).fill(null);
  if (period <= 0 || series.length < period) return result;

  const norm = (period * (period + 1)) / 2;
  for (let i = period - 1; i < series.length; i++) {
    let sum = 0;
    let valid = true;
    for (let j = 0; j < period; j++) {
      const v = series[i - j];
      if (v === null || isNaN(v)) {
        valid = false;
        break;
      }
      sum += v * (period - j);
    }
    if (valid) {
      result[i] = sum / norm;
    }
  }
  return result;
}

function calcHMA(series: (number | null)[], period: number): (number | null)[] {
  const halfPeriod = Math.max(1, Math.floor(period / 2));
  const sqrtPeriod = Math.max(1, Math.floor(Math.sqrt(period)));

  const wmaHalf = calcWMA(series, halfPeriod);
  const wmaFull = calcWMA(series, period);

  const diff: (number | null)[] = new Array(series.length).fill(null);
  for (let i = 0; i < series.length; i++) {
    if (wmaHalf[i] !== null && wmaFull[i] !== null) {
      diff[i] = 2 * wmaHalf[i]! - wmaFull[i]!;
    }
  }

  return calcWMA(diff, sqrtPeriod);
}

function calcRSI(series: (number | null)[], period: number = 14): (number | null)[] {
  const len = series.length;
  const result: (number | null)[] = new Array(len).fill(null);
  if (len <= period || period <= 0) return result;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const curr = series[i] ?? 0;
    const prev = series[i - 1] ?? 0;
    const diff = curr - prev;
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  if (avgLoss === 0) {
    result[period] = avgGain === 0 ? 50 : 100;
  } else {
    const rs = avgGain / avgLoss;
    result[period] = 100 - 100 / (1 + rs);
  }

  for (let i = period + 1; i < len; i++) {
    const curr = series[i] ?? 0;
    const prev = series[i - 1] ?? 0;
    const diff = curr - prev;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      result[i] = avgGain === 0 ? 50 : 100;
    } else {
      const rs = avgGain / avgLoss;
      result[i] = 100 - 100 / (1 + rs);
    }
  }

  return result;
}

function calcTR(candles: FormattedCandle[]): number[] {
  if (!candles || candles.length === 0) return [];
  const trs: number[] = [Math.max(0, candles[0].high - candles[0].low)];
  for (let i = 1; i < candles.length; i++) {
    const hl = Math.max(0, candles[i].high - candles[i].low);
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    trs.push(Math.max(hl, hc, lc));
  }
  return trs;
}

function calcATR(candles: FormattedCandle[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length < period || period <= 0) return result;

  const trs = calcTR(candles);
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = atr;

  for (let i = period; i < candles.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
    result[i] = atr;
  }
  return result;
}

function calcSum(series: (number | null)[], period: number): (number | null)[] {
  const len = series.length;
  const result: (number | null)[] = new Array(len).fill(null);
  if (period <= 0 || len === 0) return result;

  for (let i = period - 1; i < len; i++) {
    let sum = 0;
    let hasValid = true;
    for (let j = 0; j < period; j++) {
      const v = series[i - j];
      if (v === null || v === undefined || isNaN(v)) {
        hasValid = false;
        break;
      }
      sum += v;
    }
    if (hasValid) {
      result[i] = sum;
    }
  }
  return result;
}

function calcBollingerBands(
  series: (number | null)[],
  period: number = 20,
  mult: number = 2
): { upper: (number | null)[]; basis: (number | null)[]; lower: (number | null)[] } {
  const basis = calcSMA(series, period);
  const upper: (number | null)[] = new Array(series.length).fill(null);
  const lower: (number | null)[] = new Array(series.length).fill(null);

  for (let i = period - 1; i < series.length; i++) {
    const mean = basis[i];
    if (mean === null) continue;

    let varianceSum = 0;
    let validCount = 0;
    for (let j = 0; j < period; j++) {
      const val = series[i - j];
      if (val !== null && !isNaN(val)) {
        varianceSum += Math.pow(val - mean, 2);
        validCount++;
      }
    }

    if (validCount >= period) {
      const stdDev = Math.sqrt(varianceSum / period);
      upper[i] = mean + mult * stdDev;
      lower[i] = mean - mult * stdDev;
    }
  }

  return { upper, basis, lower };
}

function calcSupertrend(
  candles: FormattedCandle[],
  factor: number = 3,
  period: number = 10
): { supertrend: (number | null)[]; direction: (number | null)[] } {
  const supertrend: (number | null)[] = new Array(candles.length).fill(null);
  const direction: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length < period || period <= 0) return { supertrend, direction };

  const atr = calcATR(candles, period);
  const upperBands: number[] = new Array(candles.length).fill(0);
  const lowerBands: number[] = new Array(candles.length).fill(0);

  let currentDir = 1; // 1 = down, -1 = up

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const a = atr[i];
    if (a === null) continue;

    const hl2 = (c.high + c.low) / 2;
    const basicUpper = hl2 + factor * a;
    const basicLower = hl2 - factor * a;

    if (i > 0) {
      const prevClose = candles[i - 1].close;
      const prevUpper = upperBands[i - 1];
      const prevLower = lowerBands[i - 1];

      upperBands[i] = basicUpper < prevUpper || prevClose > prevUpper ? basicUpper : prevUpper;
      lowerBands[i] = basicLower > prevLower || prevClose < prevLower ? basicLower : prevLower;

      if (currentDir === -1 && c.close < lowerBands[i]) {
        currentDir = 1;
      } else if (currentDir === 1 && c.close > upperBands[i]) {
        currentDir = -1;
      }
    } else {
      upperBands[i] = basicUpper;
      lowerBands[i] = basicLower;
    }

    direction[i] = currentDir;
    supertrend[i] = currentDir === -1 ? lowerBands[i] : upperBands[i];
  }

  return { supertrend, direction };
}

function calcMACD(
  series: (number | null)[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macd: (number | null)[]; signal: (number | null)[]; hist: (number | null)[] } {
  const fastEMA = calcEMA(series, fastPeriod);
  const slowEMA = calcEMA(series, slowPeriod);
  const len = series.length;

  const macd: (number | null)[] = new Array(len).fill(null);
  for (let i = 0; i < len; i++) {
    if (fastEMA[i] !== null && slowEMA[i] !== null) {
      macd[i] = fastEMA[i]! - slowEMA[i]!;
    }
  }

  const validMACDIdx = macd.findIndex((v) => v !== null);
  const signal: (number | null)[] = new Array(len).fill(null);
  const hist: (number | null)[] = new Array(len).fill(null);

  if (validMACDIdx !== -1) {
    const macdClean = macd.slice(validMACDIdx);
    const sigClean = calcEMA(macdClean, signalPeriod);

    for (let i = 0; i < sigClean.length; i++) {
      const fullIdx = validMACDIdx + i;
      signal[fullIdx] = sigClean[i];
      if (macd[fullIdx] !== null && sigClean[i] !== null) {
        hist[fullIdx] = macd[fullIdx]! - sigClean[i]!;
      }
    }
  }

  return { macd, signal, hist };
}

function calcHighest(series: (number | null)[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(series.length).fill(null);
  if (period <= 0 || series.length === 0) return result;

  for (let i = period - 1; i < series.length; i++) {
    let max = -Infinity;
    for (let j = 0; j < period; j++) {
      const v = series[i - j];
      if (v !== null && !isNaN(v) && v > max) max = v;
    }
    if (max !== -Infinity) result[i] = max;
  }
  return result;
}

function calcLowest(series: (number | null)[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(series.length).fill(null);
  if (period <= 0 || series.length === 0) return result;

  for (let i = period - 1; i < series.length; i++) {
    let min = Infinity;
    for (let j = 0; j < period; j++) {
      const v = series[i - j];
      if (v !== null && !isNaN(v) && v < min) min = v;
    }
    if (min !== Infinity) result[i] = min;
  }
  return result;
}

function calcStochSeries(
  closeSeries: (number | null)[],
  highSeries: (number | null)[],
  lowSeries: (number | null)[],
  period: number = 14
): (number | null)[] {
  const len = closeSeries.length;
  const result: (number | null)[] = new Array(len).fill(null);
  for (let i = period - 1; i < len; i++) {
    let h = -Infinity;
    let l = Infinity;
    for (let j = 0; j < period; j++) {
      const hv = highSeries[i - j];
      const lv = lowSeries[i - j];
      if (hv !== null && !isNaN(hv) && hv > h) h = hv;
      if (lv !== null && !isNaN(lv) && lv < l) l = lv;
    }
    const c = closeSeries[i];
    if (c !== null && !isNaN(c) && h !== -Infinity && l !== Infinity) {
      const diff = h - l;
      result[i] = diff > 0 ? ((c - l) / diff) * 100 : 50;
    } else if (c !== null && !isNaN(c)) {
      result[i] = 50;
    }
  }
  return result;
}

function calcCCI(
  candles: FormattedCandle[],
  period: number = 20
): (number | null)[] {
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  const sma = calcSMA(tp, period);
  const result: (number | null)[] = new Array(candles.length).fill(null);

  for (let i = period - 1; i < candles.length; i++) {
    const mean = sma[i];
    if (mean === null) continue;
    let meanDev = 0;
    for (let j = 0; j < period; j++) {
      meanDev += Math.abs(tp[i - j] - mean);
    }
    meanDev /= period;
    if (meanDev !== 0) {
      result[i] = (tp[i] - mean) / (0.015 * meanDev);
    } else {
      result[i] = 0;
    }
  }
  return result;
}

/**
 * Evaluates numeric constant or environment variable
 */
function evaluateNumericValue(expr: string, env: Record<string, any>, defaultVal: number): number {
  const trimmed = expr.trim();
  if (env[trimmed] !== undefined) {
    if (typeof env[trimmed] === 'number') {
      return env[trimmed];
    }
    if (typeof env[trimmed] === 'string') {
      const parsedVar = parseFloat(env[trimmed]);
      if (!isNaN(parsedVar)) return parsedVar;
      if (env[trimmed] !== trimmed) {
        return evaluateNumericValue(env[trimmed], env, defaultVal);
      }
    }
  }
  const parsed = parseFloat(trimmed);
  return isNaN(parsed) ? defaultVal : parsed;
}

/**
 * Evaluates a Pine Script expression returning a series of numbers
 */
export function evaluateSeriesExpression(
  expr: string,
  env: Record<string, any>,
  candles: FormattedCandle[],
  lineNum: number,
  errors: PineCompileError[]
): (number | null)[] | null {
  const trimmed = expr.trim();
  const len = candles.length;
  if (!trimmed || len === 0) return null;

  const closes = candles.map((c) => c.close);
  const opens = candles.map((c) => c.open);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const volumes = candles.map((c) => c.volume ?? 0);
  const hl2 = candles.map((c) => (c.high + c.low) / 2);
  const hlc3 = candles.map((c) => (c.high + c.low + c.close) / 3);
  const ohlc4 = candles.map((c) => (c.open + c.high + c.low + c.close) / 4);
  const hlcc4 = candles.map((c) => (c.high + c.low + 2 * c.close) / 4);

  // 0. na / null handling
  if (trimmed === 'na' || trimmed === 'null' || trimmed === 'nan' || trimmed === 'undefined') {
    return new Array(len).fill(null);
  }

  // 1. Direct variable lookup
  if (env[trimmed] !== undefined) {
    if (Array.isArray(env[trimmed])) {
      return env[trimmed];
    }
    if (typeof env[trimmed] === 'number') {
      return new Array(len).fill(env[trimmed]);
    }
    if (typeof env[trimmed] === 'string' && env[trimmed] !== trimmed) {
      return evaluateSeriesExpression(env[trimmed], env, candles, lineNum, errors);
    }
  }

  // 2. Built-in price series
  if (trimmed === 'close') return closes;
  if (trimmed === 'open') return opens;
  if (trimmed === 'high') return highs;
  if (trimmed === 'low') return lows;
  if (trimmed === 'volume') return volumes;
  if (trimmed === 'hl2') return hl2;
  if (trimmed === 'hlc3') return hlc3;
  if (trimmed === 'ohlc4') return ohlc4;
  if (trimmed === 'hlcc4') return hlcc4;
  if (trimmed === 'bar_index') return Array.from({ length: len }, (_, i) => i);
  if (trimmed === 'time') return candles.map((c) => c.time);

  // 3. Historical offset: series[1] or var[2]
  const histMatch = trimmed.match(/^([a-zA-Z0-9_.]+)\s*\[\s*(\d+)\s*\]$/);
  if (histMatch) {
    const baseVar = histMatch[1];
    const offset = parseInt(histMatch[2], 10);
    const baseSeries = evaluateSeriesExpression(baseVar, env, candles, lineNum, errors);
    if (baseSeries) {
      const out: (number | null)[] = new Array(len).fill(null);
      for (let i = offset; i < len; i++) {
        out[i] = baseSeries[i - offset];
      }
      return out;
    }
  }

  // 4. Ternary operator: condition ? exprA : exprB
  const qIdx = trimmed.indexOf('?');
  if (qIdx > 0) {
    const condPart = trimmed.substring(0, qIdx).trim();
    const rest = trimmed.substring(qIdx + 1);
    const colonParts = splitTopLevel(rest, ':');
    if (colonParts.length === 2) {
      const condSeries = evaluateBooleanExpression(condPart, env, candles, lineNum, errors);
      const trueSeries = evaluateSeriesExpression(colonParts[0], env, candles, lineNum, errors);
      const falseSeries = evaluateSeriesExpression(colonParts[1], env, candles, lineNum, errors);

      if (condSeries) {
        const tSeries = trueSeries || new Array(len).fill(null);
        const fSeries = falseSeries || new Array(len).fill(null);
        return condSeries.map((c, i) => (c ? tSeries[i] : fSeries[i]));
      }
    }
  }

  // 5. Function Calls: nz, fixnan, ta.sma, ta.ema, ta.rsi, ta.macd, ta.bb, ta.atr, ta.wma, ta.rma, ta.hma, ta.vwma, ta.highest, ta.lowest, ta.change, ta.mom, ta.stoch, ta.cci, ta.tr, math.*
  const fnMatch = trimmed.match(/^(?:ta\.|math\.)?([a-zA-Z0-9_]+)\s*\((.*)\)$/i);
  if (fnMatch) {
    const fnName = fnMatch[1].toLowerCase();
    const argsStr = fnMatch[2];
    const { positional, named } = parseArguments(argsStr);

    // nz(source, replacement)
    if (fnName === 'nz') {
      const srcStr = named.source || positional[0] || 'close';
      const replStr = named.replacement || positional[1] || '0';
      const src = evaluateSeriesExpression(srcStr, env, candles, lineNum, errors) || new Array(len).fill(null);
      const repl = evaluateNumericValue(replStr, env, 0);
      return src.map((v) => (v === null || v === undefined || isNaN(v) ? repl : v));
    }

    // fixnan(source)
    if (fnName === 'fixnan') {
      const srcStr = named.source || positional[0] || 'close';
      const src = evaluateSeriesExpression(srcStr, env, candles, lineNum, errors) || closes;
      const out: (number | null)[] = new Array(len).fill(null);
      let lastValid: number | null = null;
      for (let i = 0; i < len; i++) {
        if (src[i] !== null && !isNaN(src[i]!)) {
          lastValid = src[i];
        }
        out[i] = lastValid;
      }
      return out;
    }

    // ta.sma(source, length)
    if (fnName === 'sma') {
      let srcStr = named.source || positional[0] || 'close';
      let lenStr = named.length || positional[1] || '14';
      if (positional.length === 1 && !isNaN(parseFloat(positional[0]))) {
        srcStr = 'close';
        lenStr = positional[0];
      }
      const src = evaluateSeriesExpression(srcStr, env, candles, lineNum, errors) || closes;
      const period = evaluateNumericValue(lenStr, env, 14);
      return calcSMA(src, period);
    }

    // ta.ema(source, length)
    if (fnName === 'ema') {
      let srcStr = named.source || positional[0] || 'close';
      let lenStr = named.length || positional[1] || '14';
      if (positional.length === 1 && !isNaN(parseFloat(positional[0]))) {
        srcStr = 'close';
        lenStr = positional[0];
      }
      const src = evaluateSeriesExpression(srcStr, env, candles, lineNum, errors) || closes;
      const period = evaluateNumericValue(lenStr, env, 14);
      return calcEMA(src, period);
    }

    // ta.wma(source, length)
    if (fnName === 'wma') {
      let srcStr = named.source || positional[0] || 'close';
      let lenStr = named.length || positional[1] || '14';
      if (positional.length === 1 && !isNaN(parseFloat(positional[0]))) {
        srcStr = 'close';
        lenStr = positional[0];
      }
      const src = evaluateSeriesExpression(srcStr, env, candles, lineNum, errors) || closes;
      const period = evaluateNumericValue(lenStr, env, 14);
      return calcWMA(src, period);
    }

    // ta.hma(source, length)
    if (fnName === 'hma') {
      let srcStr = named.source || positional[0] || 'close';
      let lenStr = named.length || positional[1] || '14';
      if (positional.length === 1 && !isNaN(parseFloat(positional[0]))) {
        srcStr = 'close';
        lenStr = positional[0];
      }
      const src = evaluateSeriesExpression(srcStr, env, candles, lineNum, errors) || closes;
      const period = evaluateNumericValue(lenStr, env, 14);
      return calcHMA(src, period);
    }

    // ta.rma(source, length)
    if (fnName === 'rma') {
      let srcStr = named.source || positional[0] || 'close';
      let lenStr = named.length || positional[1] || '14';
      if (positional.length === 1 && !isNaN(parseFloat(positional[0]))) {
        srcStr = 'close';
        lenStr = positional[0];
      }
      const src = evaluateSeriesExpression(srcStr, env, candles, lineNum, errors) || closes;
      const period = evaluateNumericValue(lenStr, env, 14);
      return calcRMA(src, period);
    }

    // ta.vwma(source, length)
    if (fnName === 'vwma') {
      const srcStr = named.source || positional[0] || 'close';
      const lenStr = named.length || positional[1] || '20';
      const src = evaluateSeriesExpression(srcStr, env, candles, lineNum, errors) || closes;
      const period = evaluateNumericValue(lenStr, env, 20);
      const pv = src.map((p, i) => (p ?? 0) * (volumes[i] ?? 1));
      const smaPV = calcSMA(pv, period);
      const smaV = calcSMA(volumes, period);
      return smaPV.map((val, i) => (val !== null && smaV[i] ? val / smaV[i]! : null));
    }

    // ta.rsi(source, length) or ta.rsi(length)
    if (fnName === 'rsi') {
      let srcStr = named.source || positional[0] || 'close';
      let lenStr = named.length || positional[1] || '14';
      if (positional.length === 1 && !isNaN(parseFloat(positional[0]))) {
        srcStr = 'close';
        lenStr = positional[0];
      }
      const src = evaluateSeriesExpression(srcStr, env, candles, lineNum, errors) || closes;
      const period = evaluateNumericValue(lenStr, env, 14);
      return calcRSI(src, period);
    }

    // ta.atr(length)
    if (fnName === 'atr') {
      const lenStr = named.length || positional[0] || '14';
      const period = evaluateNumericValue(lenStr, env, 14);
      return calcATR(candles, period);
    }

    // ta.tr / ta.tr(handle_na)
    if (fnName === 'tr') {
      return calcTR(candles);
    }

    // ta.highest(source, length) or ta.highest(length)
    if (fnName === 'highest') {
      let srcStr = 'high';
      let lenStr = '14';
      if (positional.length === 1 && !isNaN(parseFloat(positional[0]))) {
        lenStr = positional[0];
      } else if (positional.length >= 2) {
        srcStr = positional[0];
        lenStr = positional[1];
      }
      if (named.source) srcStr = named.source;
      if (named.length) lenStr = named.length;
      const src = evaluateSeriesExpression(srcStr, env, candles, lineNum, errors) || highs;
      const period = evaluateNumericValue(lenStr, env, 14);
      return calcHighest(src, period);
    }

    // ta.lowest(source, length) or ta.lowest(length)
    if (fnName === 'lowest') {
      let srcStr = 'low';
      let lenStr = '14';
      if (positional.length === 1 && !isNaN(parseFloat(positional[0]))) {
        lenStr = positional[0];
      } else if (positional.length >= 2) {
        srcStr = positional[0];
        lenStr = positional[1];
      }
      if (named.source) srcStr = named.source;
      if (named.length) lenStr = named.length;
      const src = evaluateSeriesExpression(srcStr, env, candles, lineNum, errors) || lows;
      const period = evaluateNumericValue(lenStr, env, 14);
      return calcLowest(src, period);
    }

    // ta.change(source, length) / ta.mom(source, length)
    if (fnName === 'change' || fnName === 'mom') {
      let srcStr = named.source || positional[0] || 'close';
      let lenStr = named.length || positional[1] || '1';
      if (positional.length === 1 && !isNaN(parseFloat(positional[0]))) {
        srcStr = 'close';
        lenStr = positional[0];
      }
      const src = evaluateSeriesExpression(srcStr, env, candles, lineNum, errors) || closes;
      const period = evaluateNumericValue(lenStr, env, 1);
      const out: (number | null)[] = new Array(len).fill(null);
      for (let i = period; i < len; i++) {
        if (src[i] !== null && src[i - period] !== null) {
          out[i] = src[i]! - src[i - period]!;
        }
      }
      return out;
    }

    // ta.stoch(source, high, low, length)
    if (fnName === 'stoch') {
      let src1Str = named.source || positional[0] || 'close';
      let src2Str = named.high || positional[1] || 'high';
      let src3Str = named.low || positional[2] || 'low';
      let lenStr = named.length || positional[3] || positional[1] || '14';

      if (!isNaN(parseFloat(positional[0])) && positional.length < 4) {
        src1Str = 'close';
        src2Str = 'high';
        src3Str = 'low';
        lenStr = positional[0];
      }

      const sClose = evaluateSeriesExpression(src1Str, env, candles, lineNum, errors) || closes;
      const sHigh = evaluateSeriesExpression(src2Str, env, candles, lineNum, errors) || highs;
      const sLow = evaluateSeriesExpression(src3Str, env, candles, lineNum, errors) || lows;
      const period = evaluateNumericValue(lenStr, env, 14);

      return calcStochSeries(sClose, sHigh, sLow, period);
    }

    // ta.cci(source, length)
    if (fnName === 'cci') {
      let srcStr = named.source || positional[0] || 'close';
      let lenStr = named.length || positional[1] || '20';
      if (positional.length === 1 && !isNaN(parseFloat(positional[0]))) {
        srcStr = 'close';
        lenStr = positional[0];
      }
      const period = evaluateNumericValue(lenStr, env, 20);
      return calcCCI(candles, period);
    }

    // math.abs, math.max, math.min, math.sqrt, math.round, math.floor, math.ceil, math.pow, math.sign
    if (['abs', 'max', 'min', 'sqrt', 'pow', 'round', 'floor', 'ceil', 'sign', 'avg'].includes(fnName)) {
      const arg1 = evaluateSeriesExpression(positional[0] || '0', env, candles, lineNum, errors) || new Array(len).fill(0);
      const arg2 = positional[1]
        ? evaluateSeriesExpression(positional[1], env, candles, lineNum, errors) || new Array(len).fill(0)
        : null;

      const out: (number | null)[] = new Array(len).fill(null);
      for (let i = 0; i < len; i++) {
        const v1 = arg1[i];
        const v2 = arg2 ? arg2[i] : 0;
        if (v1 === null) continue;
        if (fnName === 'abs') out[i] = Math.abs(v1);
        else if (fnName === 'sqrt') out[i] = v1 >= 0 ? Math.sqrt(v1) : null;
        else if (fnName === 'round') out[i] = Math.round(v1);
        else if (fnName === 'floor') out[i] = Math.floor(v1);
        else if (fnName === 'ceil') out[i] = Math.ceil(v1);
        else if (fnName === 'sign') out[i] = Math.sign(v1);
        else if (fnName === 'max' && v2 !== null) out[i] = Math.max(v1, v2);
        else if (fnName === 'min' && v2 !== null) out[i] = Math.min(v1, v2);
        else if (fnName === 'pow' && v2 !== null) out[i] = Math.pow(v1, v2);
        else if (fnName === 'avg' && v2 !== null) out[i] = (v1 + v2) / 2;
      }
      return out;
    }

    // math.sum(source, length) or ta.sum(source, length) or sum(source, length)
    if (fnName === 'sum') {
      let srcStr = named.source || positional[0] || 'close';
      let lenStr = named.length || positional[1] || '14';
      if (positional.length === 1 && !isNaN(parseFloat(positional[0]))) {
        srcStr = 'close';
        lenStr = positional[0];
      }
      const src = evaluateSeriesExpression(srcStr, env, candles, lineNum, errors) || closes;
      const period = evaluateNumericValue(lenStr, env, 14);
      return calcSum(src, period);
    }
  }

  // 6. Binary arithmetic with proper precedence:
  // First evaluate Addition / Subtraction
  const topTokensPlusMinus = splitTopLevel(trimmed, '+');
  if (topTokensPlusMinus.length > 1) {
    let acc = evaluateSeriesExpression(topTokensPlusMinus[0], env, candles, lineNum, errors);
    if (!acc) acc = new Array(len).fill(parseFloat(topTokensPlusMinus[0]) || 0);

    for (let p = 1; p < topTokensPlusMinus.length; p++) {
      const next = evaluateSeriesExpression(topTokensPlusMinus[p], env, candles, lineNum, errors) || new Array(len).fill(parseFloat(topTokensPlusMinus[p]) || 0);
      acc = acc.map((v, i) => (v !== null && next[i] !== null ? v + next[i]! : null));
    }
    return acc;
  }

  const topTokensMinus = splitTopLevel(trimmed, '-');
  if (topTokensMinus.length > 1 && topTokensMinus[0] !== '') {
    let acc = evaluateSeriesExpression(topTokensMinus[0], env, candles, lineNum, errors);
    if (!acc) acc = new Array(len).fill(parseFloat(topTokensMinus[0]) || 0);

    for (let p = 1; p < topTokensMinus.length; p++) {
      const next = evaluateSeriesExpression(topTokensMinus[p], env, candles, lineNum, errors) || new Array(len).fill(parseFloat(topTokensMinus[p]) || 0);
      acc = acc.map((v, i) => (v !== null && next[i] !== null ? v - next[i]! : null));
    }
    return acc;
  }

  const topTokensMul = splitTopLevel(trimmed, '*');
  if (topTokensMul.length > 1) {
    let acc = evaluateSeriesExpression(topTokensMul[0], env, candles, lineNum, errors);
    if (!acc) acc = new Array(len).fill(parseFloat(topTokensMul[0]) || 0);

    for (let p = 1; p < topTokensMul.length; p++) {
      const next = evaluateSeriesExpression(topTokensMul[p], env, candles, lineNum, errors) || new Array(len).fill(parseFloat(topTokensMul[p]) || 0);
      acc = acc.map((v, i) => (v !== null && next[i] !== null ? v * next[i]! : null));
    }
    return acc;
  }

  const topTokensDiv = splitTopLevel(trimmed, '/');
  if (topTokensDiv.length > 1) {
    let acc = evaluateSeriesExpression(topTokensDiv[0], env, candles, lineNum, errors);
    if (!acc) acc = new Array(len).fill(parseFloat(topTokensDiv[0]) || 0);

    for (let p = 1; p < topTokensDiv.length; p++) {
      const next = evaluateSeriesExpression(topTokensDiv[p], env, candles, lineNum, errors) || new Array(len).fill(parseFloat(topTokensDiv[p]) || 0);
      acc = acc.map((v, i) => (v !== null && next[i] !== null && next[i] !== 0 ? v / next[i]! : null));
    }
    return acc;
  }

  // 7. Strip surrounding parentheses: (expression)
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    return evaluateSeriesExpression(trimmed.substring(1, trimmed.length - 1), env, candles, lineNum, errors);
  }

  // 8. Static numeric constant
  const num = parseFloat(trimmed);
  if (!isNaN(num)) {
    return new Array(len).fill(num);
  }

  return null;
}

/**
 * Evaluates boolean condition series (ta.crossover, ta.crossunder, >, <, >=, <=, ==, and, or, not)
 */
export function evaluateBooleanExpression(
  expr: string,
  env: Record<string, any>,
  candles: FormattedCandle[],
  lineNum: number,
  errors: PineCompileError[]
): boolean[] | null {
  const trimmed = expr.trim();
  const len = candles.length;
  if (!trimmed || len === 0) return null;
  const closes = candles.map((c) => c.close);

  // 1. Direct variable lookup
  if (env[trimmed] !== undefined) {
    const val = env[trimmed];
    if (Array.isArray(val)) {
      const isBool = val.some((v: any) => typeof v === 'boolean');
      if (isBool) {
        return val.map((v: any) => Boolean(v));
      }
      return val.map((v: any) => v !== null && v !== undefined && !isNaN(v) && v !== 0);
    }
    if (typeof val === 'boolean') {
      return new Array(len).fill(val);
    }
    if (typeof val === 'string') {
      const lower = val.toLowerCase().trim();
      if (lower === 'true' || lower === '1') return new Array(len).fill(true);
      if (lower === 'false' || lower === '0') return new Array(len).fill(false);
    }
    if (typeof val === 'number') {
      return new Array(len).fill(!isNaN(val) && val !== 0);
    }
  }

  // 1a. Direct boolean literals
  if (trimmed === 'true') return new Array(len).fill(true);
  if (trimmed === 'false') return new Array(len).fill(false);

  // 1a1. String equality comparison (e.g. timeframe.period == "5S" or timeframe.period == "1")
  if (trimmed.includes('==') || trimmed.includes('!=')) {
    const isEq = trimmed.includes('==');
    const op = isEq ? '==' : '!=';
    const parts = splitTopLevel(trimmed, op);
    if (parts.length === 2) {
      const left = parts[0].trim();
      const right = parts[1].trim();
      const leftIsStr = left.startsWith('"') || left.startsWith("'") || typeof env[left] === 'string';
      const rightIsStr = right.startsWith('"') || right.startsWith("'") || typeof env[right] === 'string';
      if (leftIsStr || rightIsStr) {
        const leftVal = env[left] !== undefined ? String(env[left]) : left.replace(/['"]/g, '');
        const rightVal = env[right] !== undefined ? String(env[right]) : right.replace(/['"]/g, '');
        const match = isEq ? leftVal === rightVal : leftVal !== rightVal;
        return new Array(len).fill(match);
      }
    }
  }

  // 1a. ta.na(x) or na(x)
  const naMatch = trimmed.match(/^(?:ta\.)?na\s*\((.*)\)$/i);
  if (naMatch) {
    const argStr = naMatch[1].trim();
    const series = evaluateSeriesExpression(argStr, env, candles, lineNum, errors);
    const out: boolean[] = new Array(len).fill(true);
    if (series) {
      for (let i = 0; i < len; i++) {
        out[i] = series[i] === null || series[i] === undefined || isNaN(series[i]!);
      }
    }
    return out;
  }

  // 1b. ta.rising(source, length)
  const risingMatch = trimmed.match(/^(?:ta\.)?rising\s*\((.*)\)$/i);
  if (risingMatch) {
    const { positional, named } = parseArguments(risingMatch[1]);
    const src = evaluateSeriesExpression(named.source || positional[0] || 'close', env, candles, lineNum, errors) || closes;
    const period = evaluateNumericValue(named.length || positional[1] || '1', env, 1);
    const out: boolean[] = new Array(len).fill(false);
    for (let i = period; i < len; i++) {
      let isRising = true;
      for (let j = 0; j < period; j++) {
        if (src[i - j] === null || src[i - j - 1] === null || src[i - j]! <= src[i - j - 1]!) {
          isRising = false;
          break;
        }
      }
      out[i] = isRising;
    }
    return out;
  }

  // 1c. ta.falling(source, length)
  const fallingMatch = trimmed.match(/^(?:ta\.)?falling\s*\((.*)\)$/i);
  if (fallingMatch) {
    const { positional, named } = parseArguments(fallingMatch[1]);
    const src = evaluateSeriesExpression(named.source || positional[0] || 'close', env, candles, lineNum, errors) || closes;
    const period = evaluateNumericValue(named.length || positional[1] || '1', env, 1);
    const out: boolean[] = new Array(len).fill(false);
    for (let i = period; i < len; i++) {
      let isFalling = true;
      for (let j = 0; j < period; j++) {
        if (src[i - j] === null || src[i - j - 1] === null || src[i - j]! >= src[i - j - 1]!) {
          isFalling = false;
          break;
        }
      }
      out[i] = isFalling;
    }
    return out;
  }

  // 1d. ta.cross(a, b)
  const crossMatch = trimmed.match(/^(?:ta\.)?cross\s*\((.*)\)$/i);
  if (crossMatch && !crossMatch[0].toLowerCase().includes('crossover') && !crossMatch[0].toLowerCase().includes('crossunder')) {
    const { positional, named } = parseArguments(crossMatch[1]);
    const src1 = named.source1 || positional[0] || 'close';
    const src2 = named.source2 || positional[1] || 'open';
    const a = evaluateSeriesExpression(src1, env, candles, lineNum, errors) || closes;
    const b = evaluateSeriesExpression(src2, env, candles, lineNum, errors) || new Array(len).fill(parseFloat(src2) || 0);

    const out: boolean[] = new Array(len).fill(false);
    for (let i = 1; i < len; i++) {
      const prevA = a[i - 1];
      const prevB = b[i - 1];
      const currA = a[i];
      const currB = b[i];
      if (prevA !== null && prevB !== null && currA !== null && currB !== null) {
        out[i] = (prevA <= prevB && currA > currB) || (prevA >= prevB && currA < currB);
      }
    }
    return out;
  }

  // 2. Logical "or"
  const orParts = splitTopLevel(trimmed, 'or');
  if (orParts.length > 1) {
    let acc = evaluateBooleanExpression(orParts[0], env, candles, lineNum, errors);
    for (let i = 1; i < orParts.length; i++) {
      const next = evaluateBooleanExpression(orParts[i], env, candles, lineNum, errors);
      if (acc && next) {
        acc = acc.map((v, idx) => v || next[idx]);
      }
    }
    if (acc) return acc;
  }

  // 3. Logical "and"
  const andParts = splitTopLevel(trimmed, 'and');
  if (andParts.length > 1) {
    let acc = evaluateBooleanExpression(andParts[0], env, candles, lineNum, errors);
    for (let i = 1; i < andParts.length; i++) {
      const next = evaluateBooleanExpression(andParts[i], env, candles, lineNum, errors);
      if (acc && next) {
        acc = acc.map((v, idx) => v && next[idx]);
      }
    }
    if (acc) return acc;
  }

  // 4. Logical "not"
  if (trimmed.startsWith('not ')) {
    const sub = evaluateBooleanExpression(trimmed.substring(4), env, candles, lineNum, errors);
    if (sub) {
      return sub.map((v) => !v);
    }
  }

  // 5. ta.crossover(a, b)
  const crossOverMatch = trimmed.match(/^(?:ta\.)?crossover\s*\((.*)\)$/i);
  if (crossOverMatch) {
    const { positional, named } = parseArguments(crossOverMatch[1]);
    const src1 = named.source1 || positional[0] || 'close';
    const src2 = named.source2 || positional[1] || 'open';
    const a = evaluateSeriesExpression(src1, env, candles, lineNum, errors) || closes;
    const b = evaluateSeriesExpression(src2, env, candles, lineNum, errors) || new Array(len).fill(parseFloat(src2) || 0);

    const out: boolean[] = new Array(len).fill(false);
    for (let i = 1; i < len; i++) {
      const prevA = a[i - 1];
      const prevB = b[i - 1];
      const currA = a[i];
      const currB = b[i];
      if (prevA !== null && prevB !== null && currA !== null && currB !== null) {
        out[i] = prevA <= prevB && currA > currB;
      }
    }
    return out;
  }

  // 6. ta.crossunder(a, b)
  const crossUnderMatch = trimmed.match(/^(?:ta\.)?crossunder\s*\((.*)\)$/i);
  if (crossUnderMatch) {
    const { positional, named } = parseArguments(crossUnderMatch[1]);
    const src1 = named.source1 || positional[0] || 'close';
    const src2 = named.source2 || positional[1] || 'open';
    const a = evaluateSeriesExpression(src1, env, candles, lineNum, errors) || closes;
    const b = evaluateSeriesExpression(src2, env, candles, lineNum, errors) || new Array(len).fill(parseFloat(src2) || 0);

    const out: boolean[] = new Array(len).fill(false);
    for (let i = 1; i < len; i++) {
      const prevA = a[i - 1];
      const prevB = b[i - 1];
      const currA = a[i];
      const currB = b[i];
      if (prevA !== null && prevB !== null && currA !== null && currB !== null) {
        out[i] = prevA >= prevB && currA < currB;
      }
    }
    return out;
  }

  // 7. Comparison operators: >=, <=, ==, !=, >, <
  const compOps = ['>=', '<=', '==', '!=', '>', '<'];
  for (const op of compOps) {
    const opIdx = trimmed.indexOf(op);
    if (opIdx > 0) {
      const leftStr = trimmed.substring(0, opIdx).trim();
      const rightStr = trimmed.substring(opIdx + op.length).trim();
      const a = evaluateSeriesExpression(leftStr, env, candles, lineNum, errors) || new Array(len).fill(parseFloat(leftStr) || 0);
      const b = evaluateSeriesExpression(rightStr, env, candles, lineNum, errors) || new Array(len).fill(parseFloat(rightStr) || 0);

      const out: boolean[] = new Array(len).fill(false);
      for (let i = 0; i < len; i++) {
        const aVal = a[i];
        const bVal = b[i];
        if (aVal === null || bVal === null) continue;

        if (op === '>') out[i] = aVal > bVal;
        else if (op === '<') out[i] = aVal < bVal;
        else if (op === '>=') out[i] = aVal >= bVal;
        else if (op === '<=') out[i] = aVal <= bVal;
        else if (op === '==') out[i] = Math.abs(aVal - bVal) < 1e-9;
        else if (op === '!=') out[i] = Math.abs(aVal - bVal) >= 1e-9;
      }
      return out;
    }
  }

  // 8. Strip surrounding parentheses: (condition)
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    return evaluateBooleanExpression(trimmed.substring(1, trimmed.length - 1), env, candles, lineNum, errors);
  }

  return null;
}

/**
 * Executes Pine Script v5 code against historical candles safely
 */
export function executePineScript(
  scriptCode: string,
  candles: FormattedCandle[],
  timeframeSeconds: number = 60
): PineExecutionResult {
  const startTime = performance.now();
  const errors: PineCompileError[] = [];
  const logs: string[] = [];
  const plots: PinePlot[] = [];
  const hlines: PineHLine[] = [];
  const markers: PineMarker[] = [];
  const trades: PineStrategyTrade[] = [];

  const defaultResult: PineExecutionResult = {
    success: false,
    scriptName: 'Custom Pine Script',
    scriptType: 'indicator',
    isOverlay: true,
    timeframe: timeframeSeconds,
    plots: [],
    hlines: [],
    markers: [],
    errors: [],
    logs: [],
    executionTimeMs: 0,
  };

  if (!candles || candles.length === 0) {
    errors.push({ line: 1, message: 'No market candles available for script execution' });
    return { ...defaultResult, errors };
  }

  if (!scriptCode || !scriptCode.trim()) {
    errors.push({ line: 1, message: 'Pine Script source code is empty' });
    return { ...defaultResult, errors };
  }

  try {
    const len = candles.length;
    const times = candles.map((c) => c.time);
    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const env: Record<string, any> = {};

    // Determine standard Pine Script timeframe identifiers
    const tfPeriod =
      timeframeSeconds === 5 ? '5S' :
      timeframeSeconds === 15 ? '15S' :
      timeframeSeconds === 30 ? '30S' :
      timeframeSeconds === 60 ? '1' :
      timeframeSeconds === 300 ? '5' :
      timeframeSeconds === 900 ? '15' :
      timeframeSeconds === 3600 ? '60' :
      timeframeSeconds === 14400 ? '240' :
      timeframeSeconds === 86400 ? 'D' :
      `${Math.max(1, Math.round(timeframeSeconds / 60))}`;

    const tfMultiplier =
      timeframeSeconds < 60
        ? timeframeSeconds
        : timeframeSeconds < 86400
        ? Math.max(1, Math.round(timeframeSeconds / 60))
        : Math.max(1, Math.round(timeframeSeconds / 86400));

    // Initial default environment values
    env.close = closes;
    env.open = candles.map((c) => c.open);
    env.high = highs;
    env.low = lows;
    env.volume = candles.map((c) => c.volume ?? 0);
    env.hl2 = candles.map((c) => (c.high + c.low) / 2);
    env.hlc3 = candles.map((c) => (c.high + c.low + c.close) / 3);
    env.ohlc4 = candles.map((c) => (c.open + c.high + c.low + c.close) / 4);
    env.hlcc4 = candles.map((c) => (c.high + c.low + 2 * c.close) / 4);
    env.bar_index = Array.from({ length: len }, (_, i) => i);
    env.last_bar_index = len - 1;
    env.time = times;
    env.na = null;

    // Timeframe built-in variables
    env['timeframe.period'] = tfPeriod;
    env['timeframe.multiplier'] = tfMultiplier;
    env['timeframe.isseconds'] = timeframeSeconds < 60;
    env['timeframe.isminutes'] = timeframeSeconds >= 60 && timeframeSeconds < 86400;
    env['timeframe.isintraday'] = timeframeSeconds < 86400;
    env['timeframe.isdaily'] = timeframeSeconds >= 86400;
    env['period'] = tfPeriod;
    env['interval'] = tfMultiplier;

    // Symbol & Barstate info
    env['syminfo.tickerid'] = 'BINOMO:CRYPTO_IDX';
    env['syminfo.mintick'] = 0.01;
    env['syminfo.pointvalue'] = 1;

    env['barstate.isconfirmed'] = true;
    env['barstate.isfirst'] = false;
    env['barstate.islast'] = true;
    env['barstate.isnew'] = false;

    env['location.absolute'] = 'absolute';
    env['location.belowbar'] = 'belowBar';
    env['location.abovebar'] = 'aboveBar';
    env['shape.labelup'] = 'arrowUp';
    env['shape.labeldown'] = 'arrowDown';
    env['shape.triangleup'] = 'arrowUp';
    env['shape.triangledown'] = 'arrowDown';
    env['shape.circle'] = 'circle';
    env['shape.square'] = 'square';
    env['size.small'] = 'small';
    env['size.normal'] = 'normal';
    env['color.green'] = '#22c55e';
    env['color.red'] = '#ef4444';
    env['color.white'] = '#ffffff';
    env['color.black'] = '#0f172a';
    env['color.blue'] = '#3b82f6';
    env['color.orange'] = '#f97316';
    env['color.yellow'] = '#eab308';
    env['color.purple'] = '#a855f7';

    let scriptName = 'Custom Pine Script';
    let scriptType: 'indicator' | 'strategy' = 'indicator';
    let isOverlay = true;
    let initialCapital = 10000;
    let defaultQty = 1;

    // Split code into complete statements handling multiline continuations and semicolons
    const rawLines = scriptCode.split(/\r?\n/);
    interface FlattenedLine {
      raw: string;
      lineNum: number;
      isIf?: boolean;
      condExpr?: string;
      bodyLines?: string[];
    }
    const flattenedLines: FlattenedLine[] = [];

    let currentAcc = '';
    let startLineNum = 1;

    for (let i = 0; i < rawLines.length; i++) {
      const lineNum = i + 1;
      const cleanLine = rawLines[i].replace(/\/\/.*$/, '').trim(); // Remove inline comments
      if (!cleanLine) continue;

      // Handle indented if blocks (e.g. if bar_index >= kPeriod - 1)
      const isIfHeader = /^(?:else\s+)?if\b/i.test(cleanLine) || /^else\b/i.test(cleanLine);
      const isAssignmentBeforeIf = /^\s*(?:[a-zA-Z0-9_]+\s*[:=]+)/.test(cleanLine);
      if (!currentAcc && isIfHeader && !isAssignmentBeforeIf && !cleanLine.includes('strategy.') && !cleanLine.includes('plot(')) {
        const condMatch = cleanLine.match(/^(?:else\s+)?if\s+(.*)$/i);
        const condExpr = condMatch ? condMatch[1].replace(/then\s*$/i, '').trim() : 'true';

        const bodyLines: string[] = [];
        let j = i + 1;
        while (j < rawLines.length) {
          const nextRaw = rawLines[j];
          const nextClean = nextRaw.replace(/\/\/.*$/, '').trim();
          if (/^\s+/.test(nextRaw) || (!nextClean && j + 1 < rawLines.length && /^\s+/.test(rawLines[j + 1]))) {
            if (nextClean) {
              bodyLines.push(nextClean);
            }
            j++;
          } else {
            break;
          }
        }

        if (bodyLines.length > 0) {
          flattenedLines.push({
            raw: cleanLine,
            lineNum,
            isIf: true,
            condExpr,
            bodyLines,
          });
          i = j - 1;
          continue;
        }
      }

      if (!currentAcc) {
        startLineNum = lineNum;
        currentAcc = cleanLine;
      } else {
        currentAcc += ' ' + cleanLine;
      }

      // Check balance of parentheses, brackets, and braces
      let openParen = 0;
      let openBracket = 0;
      let openBrace = 0;
      let inQuote = false;
      let qChar = '';

      for (let k = 0; k < currentAcc.length; k++) {
        const char = currentAcc[k];
        if (inQuote) {
          if (char === qChar && currentAcc[k - 1] !== '\\') inQuote = false;
        } else {
          if (char === '"' || char === "'") {
            inQuote = true;
            qChar = char;
          } else if (char === '(') openParen++;
          else if (char === ')') openParen = Math.max(0, openParen - 1);
          else if (char === '[') openBracket++;
          else if (char === ']') openBracket = Math.max(0, openBracket - 1);
          else if (char === '{') openBrace++;
          else if (char === '}') openBrace = Math.max(0, openBrace - 1);
        }
      }

      // Check trailing continuation operators: comma, +, -, *, /, ?, :, and, or, =, :=
      const endsWithOp = /(?:[,+\-*\/?:=]|and|or)\s*$/i.test(currentAcc);

      // If everything is balanced and no trailing operator, flush statement(s)
      if (openParen === 0 && openBracket === 0 && openBrace === 0 && !endsWithOp) {
        const subStatements = splitTopLevel(currentAcc, ';');
        for (const stmt of subStatements) {
          if (stmt.trim()) {
            flattenedLines.push({ raw: stmt.trim(), lineNum: startLineNum });
          }
        }
        currentAcc = '';
      }
    }

    if (currentAcc.trim()) {
      const subStatements = splitTopLevel(currentAcc, ';');
      for (const stmt of subStatements) {
        if (stmt.trim()) {
          flattenedLines.push({ raw: stmt.trim(), lineNum: startLineNum });
        }
      }
    }

    // 1. First Pass: Detect Script Header (indicator, study, strategy)
    for (const { raw } of flattenedLines) {
      if (raw.startsWith('indicator(') || raw.startsWith('study(')) {
        scriptType = 'indicator';
        const match = raw.match(/(?:indicator|study)\s*\((.*)\)/i);
        if (match) {
          const { positional, named } = parseArguments(match[1]);
          if (positional[0]) {
            scriptName = positional[0].replace(/['"]/g, '');
          }
          if (named.title) {
            scriptName = named.title.replace(/['"]/g, '');
          }
          if (named.overlay !== undefined) {
            isOverlay = named.overlay === 'true' || named.overlay === '1';
          }
        }
        logs.push(`Loaded indicator: "${scriptName}" (Overlay: ${isOverlay})`);
        break;
      } else if (raw.startsWith('strategy(')) {
        scriptType = 'strategy';
        const match = raw.match(/strategy\s*\((.*)\)/i);
        if (match) {
          const { positional, named } = parseArguments(match[1]);
          if (positional[0]) {
            scriptName = positional[0].replace(/['"]/g, '');
          }
          if (named.title) {
            scriptName = named.title.replace(/['"]/g, '');
          }
          if (named.overlay !== undefined) {
            isOverlay = named.overlay === 'true' || named.overlay === '1';
          }
          if (named.initial_capital) {
            initialCapital = parseFloat(named.initial_capital) || 10000;
          }
          if (named.default_qty_value) {
            defaultQty = parseFloat(named.default_qty_value) || 1;
          }
        }
        logs.push(`Loaded strategy: "${scriptName}" (Overlay: ${isOverlay}, Capital: $${initialCapital})`);
        break;
      }
    }

    let openPosition: { type: 'long' | 'short'; entryTime: number; entryPrice: number; qty: number } | null = null;

    // 2. Second Pass: Execute statement by statement
    for (const item of flattenedLines) {
      const { raw, lineNum } = item;

      if (raw.startsWith('//@version') || raw.startsWith('indicator(') || raw.startsWith('study(') || raw.startsWith('strategy(') || raw.startsWith('alertcondition(')) {
        continue;
      }

      // Handle multiline indented if block
      if (item.isIf && item.condExpr && item.bodyLines) {
        const condSeries = evaluateBooleanExpression(item.condExpr, env, candles, lineNum, errors);
        if (condSeries) {
          for (const bodyStmt of item.bodyLines) {
            const assignMatch = bodyStmt.match(/^(?:var(?:ip)?\s+)?(?:series\s+)?(?:float|int|bool|color|string)?\s*([a-zA-Z0-9_]+)\s*[:=]+\s*(.*)/i);
            if (assignMatch) {
              const vName = assignMatch[1].trim();
              const exprStr = assignMatch[2].trim();

              const valSeries = evaluateSeriesExpression(exprStr, env, candles, lineNum, errors);
              const boolValSeries = !valSeries ? evaluateBooleanExpression(exprStr, env, candles, lineNum, errors) : null;

              if (!env[vName] || !Array.isArray(env[vName])) {
                env[vName] = new Array(len).fill(null);
              }

              for (let idx = 0; idx < len; idx++) {
                if (condSeries[idx]) {
                  if (valSeries) {
                    env[vName][idx] = valSeries[idx];
                  } else if (boolValSeries) {
                    env[vName][idx] = boolValSeries[idx];
                  } else {
                    const numVal = parseFloat(exprStr);
                    env[vName][idx] = isNaN(numVal) ? exprStr.replace(/['"]/g, '') : numVal;
                  }
                } else if (idx > 0 && bodyStmt.includes('var ')) {
                  // Keep persistent value if var declared
                  env[vName][idx] = env[vName][idx - 1];
                }
              }
            }
          }
        }
        continue;
      }

      // Handle Horizontal Line: hline(price, title="...", color=..., linestyle=...)
      if (raw.startsWith('hline(')) {
        const match = raw.match(/^hline\s*\((.*)\)$/i);
        if (match) {
          const { positional, named } = parseArguments(match[1]);
          const price = evaluateNumericValue(positional[0] || '0', env, 0);
          const title = named.title?.replace(/['"]/g, '') || positional[1]?.replace(/['"]/g, '') || `Level ${price}`;
          const color = resolvePineColor(named.color || positional[2], false);
          const styleStr = named.linestyle || positional[3] || 'dashed';
          const lineStyle = styleStr.includes('dotted') ? 'dotted' : styleStr.includes('solid') ? 'solid' : 'dashed';

          hlines.push({
            id: `hline-${hlines.length + 1}`,
            price,
            title,
            color,
            lineStyle,
          });
        }
        continue;
      }

      // Handle Plot: plot(series, title="...", color=..., linewidth=..., style=...)
      if (/^plot\s*\(/i.test(raw)) {
        const match = raw.match(/^plot\s*\((.*)\)$/i);
        if (match) {
          const { positional, named } = parseArguments(match[1]);
          const seriesExpr = named.series || positional[0] || 'close';
          const plotTitle = named.title?.replace(/['"]/g, '') || (positional[1] && !positional[1].includes('color') ? positional[1].replace(/['"]/g, '') : `Plot ${plots.length + 1}`);
          const colorStr = named.color || (positional[1]?.includes('color') ? positional[1] : positional[2]);
          const defaultCol = plots.length === 0 ? '#3b82f6' : plots.length === 1 ? '#f59e0b' : plots.length === 2 ? '#a855f7' : '#10b981';
          const color = colorStr ? resolvePineColor(colorStr, true) : defaultCol;
          const lineWidth = named.linewidth ? parseInt(named.linewidth, 10) : 2;
          const styleStr = named.style || '';
          const isHistogram = styleStr.includes('histogram') || styleStr.includes('columns');

          const seriesData = evaluateSeriesExpression(seriesExpr, env, candles, lineNum, errors);
          if (seriesData) {
            const rawPoints: { time: number; value: number }[] = [];
            for (let i = 0; i < len; i++) {
              const v = seriesData[i];
              if (v !== null && !isNaN(v) && isFinite(v)) {
                rawPoints.push({ time: times[i], value: v });
              }
            }

            // Guarantee strictly sorted and deduplicated plot points
            const cleanPoints = sanitizePlotData(rawPoints);

            plots.push({
              id: `plot-${plots.length + 1}`,
              title: plotTitle,
              color,
              lineWidth,
              style: isHistogram ? 'histogram' : 'line',
              data: cleanPoints,
            });
          }
        }
        continue;
      }

      // Handle Marker Shapes: plotshape(condition, title="...", style=..., location=..., color=..., text=...)
      if (/^(?:plotshape|plotchar|plotarrow)\s*\(/i.test(raw)) {
        const match = raw.match(/^(?:plotshape|plotchar|plotarrow)\s*\((.*)\)$/i);
        if (match) {
          const { positional, named } = parseArguments(match[1]);
          const condExpr = named.condition || positional[0] || 'false';
          const condSeries = evaluateBooleanExpression(condExpr, env, candles, lineNum, errors);

          if (condSeries) {
            const styleStr = (named.style || positional[2] || '').toLowerCase();
            const titleStr = (named.title || '').toLowerCase();
            const rawLower = raw.toLowerCase();
            const isSell = styleStr.includes('labeldown') || styleStr.includes('triangledown') || styleStr.includes('arrowdown') || titleStr.includes('sell') || rawLower.includes('sell');
            const color = named.color ? resolvePineColor(named.color, !isSell) : isSell ? '#ef4444' : '#22c55e';
            const shape = isSell ? 'arrowDown' : 'arrowUp';

            let pos: 'aboveBar' | 'belowBar' = isSell ? 'aboveBar' : 'belowBar';
            if (named.location) {
              const locStr = named.location.toLowerCase();
              if (locStr.includes('abovebar')) pos = 'aboveBar';
              else if (locStr.includes('belowbar')) pos = 'belowBar';
            }

            let text = named.text?.replace(/['"]/g, '') || named.char?.replace(/['"]/g, '') || '';
            text = text.replace(/[⇧⇩↑↓▲▼⇪]/g, '').trim();

            for (let i = 0; i < len; i++) {
              if (condSeries[i]) {
                markers.push({
                  time: times[i],
                  position: pos,
                  color,
                  shape,
                  text,
                });
              }
            }
          }
        }
        continue;
      }

      // Handle If Statements for Strategy: if (condition) strategy.entry(...) or if condition ...
      const ifMatch = raw.match(/^if\s*\(?(.*?)\)?\s*(?:then\s*)?(strategy\.(?:entry|close|exit)\s*\(.*\))$/i);
      if (ifMatch) {
        const condExpr = ifMatch[1].trim();
        const stratCall = ifMatch[2].trim();
        const condSeries = evaluateBooleanExpression(condExpr, env, candles, lineNum, errors);

        if (condSeries) {
          executeStrategyStatement(stratCall, condSeries, candles, trades, markers, defaultQty, (pos) => {
            openPosition = pos;
          }, () => openPosition);
        }
        continue;
      }

      // Direct strategy entry / close statement
      if (raw.startsWith('strategy.entry(') || raw.startsWith('strategy.close(') || raw.startsWith('strategy.exit(')) {
        executeStrategyStatement(raw, null, candles, trades, markers, defaultQty, (pos) => {
          openPosition = pos;
        }, () => openPosition);
        continue;
      }

      // Handle Tuple Destructuring: [a, b] = ta.supertrend(...) or [basis, upper, lower] = ta.bb(...)
      const tupleMatch = raw.match(/^\[(.*)\]\s*=\s*(.*)/);
      if (tupleMatch) {
        const varNames = tupleMatch[1].split(',').map((s) =>
          s.trim().replace(/^(?:var(?:ip)?\s+)?(?:series\s+)?(?:float|int|bool|color|string)\s+/i, '')
        );
        const expr = tupleMatch[2].trim();

        // Supertrend: [st, dir] = ta.supertrend(factor, period)
        if (expr.toLowerCase().includes('supertrend')) {
          const stMatch = expr.match(/(?:ta\.)?supertrend\s*\((.*)\)/i);
          if (stMatch) {
            const { positional, named } = parseArguments(stMatch[1]);
            const factor = evaluateNumericValue(named.factor || positional[0] || '3', env, 3);
            const period = evaluateNumericValue(named.period || positional[1] || '10', env, 10);
            const { supertrend, direction } = calcSupertrend(candles, factor, period);
            if (varNames[0]) env[varNames[0]] = supertrend;
            if (varNames[1]) env[varNames[1]] = direction;
            continue;
          }
        }

        // Bollinger Bands: [basis, upper, lower] = ta.bb(close, 20, 2)
        if (expr.toLowerCase().includes('bb')) {
          const bbMatch = expr.match(/(?:ta\.)?bb\s*\((.*)\)/i);
          if (bbMatch) {
            const { positional, named } = parseArguments(bbMatch[1]);
            const srcStr = named.series || positional[0] || 'close';
            const lenStr = named.length || positional[1] || '20';
            const multStr = named.mult || positional[2] || '2';
            const src = evaluateSeriesExpression(srcStr, env, candles, lineNum, errors) || closes;
            const period = evaluateNumericValue(lenStr, env, 20);
            const mult = evaluateNumericValue(multStr, env, 2);
            const { upper, basis, lower } = calcBollingerBands(src, period, mult);
            if (varNames[0]) env[varNames[0]] = basis;
            if (varNames[1]) env[varNames[1]] = upper;
            if (varNames[2]) env[varNames[2]] = lower;
            continue;
          }
        }

        // MACD: [macd, signal, hist] = ta.macd(close, 12, 26, 9)
        if (expr.toLowerCase().includes('macd')) {
          const macdMatch = expr.match(/(?:ta\.)?macd\s*\((.*)\)/i);
          if (macdMatch) {
            const { positional, named } = parseArguments(macdMatch[1]);
            const srcStr = named.source || positional[0] || 'close';
            const fast = evaluateNumericValue(named.fast || positional[1] || '12', env, 12);
            const slow = evaluateNumericValue(named.slow || positional[2] || '26', env, 26);
            const sig = evaluateNumericValue(named.signal || positional[3] || '9', env, 9);
            const src = evaluateSeriesExpression(srcStr, env, candles, lineNum, errors) || closes;
            const { macd, signal, hist } = calcMACD(src, fast, slow, sig);
            if (varNames[0]) env[varNames[0]] = macd;
            if (varNames[1]) env[varNames[1]] = signal;
            if (varNames[2]) env[varNames[2]] = hist;
            continue;
          }
        }

        // Stochastic: [k, d] = ta.stoch(...) or [k, d] = stoch(...)
        if (expr.toLowerCase().includes('stoch')) {
          const stochMatch = expr.match(/(?:ta\.)?stoch\s*\((.*)\)/i);
          if (stochMatch) {
            const { positional, named } = parseArguments(stochMatch[1]);
            let src1Str = named.source || positional[0] || 'close';
            let src2Str = named.high || positional[1] || 'high';
            let src3Str = named.low || positional[2] || 'low';
            let lenStr = named.length || positional[3] || '14';

            if (!isNaN(parseFloat(positional[0])) && positional.length < 4) {
              src1Str = 'close';
              src2Str = 'high';
              src3Str = 'low';
              lenStr = positional[0];
            }

            const sClose = evaluateSeriesExpression(src1Str, env, candles, lineNum, errors) || closes;
            const sHigh = evaluateSeriesExpression(src2Str, env, candles, lineNum, errors) || highs;
            const sLow = evaluateSeriesExpression(src3Str, env, candles, lineNum, errors) || lows;
            const period = evaluateNumericValue(lenStr, env, 14);

            const stochVal = calcStochSeries(sClose, sHigh, sLow, period);
            const smoothK = evaluateNumericValue(named.smoothk || positional[1] || '3', env, 3);
            const smoothD = evaluateNumericValue(named.smoothd || positional[2] || '3', env, 3);

            const kVal = calcSMA(stochVal, smoothK);
            const dVal = calcSMA(kVal, smoothD);

            if (varNames[0]) env[varNames[0]] = kVal;
            if (varNames[1]) env[varNames[1]] = dVal;
            continue;
          }
        }
      }

      // Handle Variable Assignment: name = expression or var name = expression or name := expression or typed variable
      const assignMatch = raw.match(/^(?:var(?:ip)?\s+)?(?:series\s+)?(?:float|int|bool|color|string|line|label|box|table|matrix|array)?\s*([a-zA-Z0-9_]+)\s*[:=]+\s*(.*)/i);
      if (assignMatch) {
        const varName = assignMatch[1].trim();
        const expr = assignMatch[2].trim();
        const isVarDeclared = raw.startsWith('var ') || raw.startsWith('varip ');

        // 1. Input statement: name = input(14, "Length") or input.int(...)
        if (expr.startsWith('input(') || expr.startsWith('input.')) {
          const inputMatch = expr.match(/^input(?:\.(?:int|float|string|bool|source|color))?\s*\((.*)\)/i);
          if (inputMatch) {
            const { positional, named } = parseArguments(inputMatch[1]);
            const defValStr = named.defval || positional[0] || '14';
            if (env[defValStr] !== undefined) {
              env[varName] = env[defValStr];
            } else {
              const cleaned = defValStr.replace(/['"]/g, '').trim();
              if (cleaned.toLowerCase() === 'true') {
                env[varName] = true;
              } else if (cleaned.toLowerCase() === 'false') {
                env[varName] = false;
              } else {
                const numVal = parseFloat(cleaned);
                env[varName] = isNaN(numVal) ? cleaned : numVal;
              }
            }
            continue;
          }
        }

        // 2. Boolean series expression
        const boolSeries = evaluateBooleanExpression(expr, env, candles, lineNum, errors);
        if (boolSeries) {
          if (isVarDeclared && env[varName] && Array.isArray(env[varName])) {
            // Carry forward persistent state
            for (let bIdx = 1; bIdx < len; bIdx++) {
              if (boolSeries[bIdx] === null || boolSeries[bIdx] === undefined) {
                boolSeries[bIdx] = boolSeries[bIdx - 1];
              }
            }
          }
          env[varName] = boolSeries;
          continue;
        }

        // 3. Numeric series expression
        const numSeries = evaluateSeriesExpression(expr, env, candles, lineNum, errors);
        if (numSeries) {
          if (isVarDeclared && env[varName] && Array.isArray(env[varName])) {
            for (let bIdx = 1; bIdx < len; bIdx++) {
              if (numSeries[bIdx] === null || numSeries[bIdx] === undefined || isNaN(numSeries[bIdx]!)) {
                numSeries[bIdx] = numSeries[bIdx - 1];
              }
            }
          }
          env[varName] = numSeries;
          continue;
        }

        // 4. Fallback numeric / primitive
        const numVal = parseFloat(expr);
        env[varName] = isNaN(numVal) ? expr.replace(/['"]/g, '') : numVal;
        continue;
      }
    }

    // 3. Strategy Statistics Calculation (Safe execution without lookahead bias)
    let strategyStats: PineStrategyStats | undefined;
    if (scriptType === 'strategy' && trades.length > 0) {
      let winningTrades = 0;
      let losingTrades = 0;
      let totalGains = 0;
      let totalLosses = 0;
      let netProfit = 0;
      let currentEquity = initialCapital;
      let peakEquity = initialCapital;
      let maxDrawdown = 0;

      for (const t of trades) {
        netProfit += t.pnl;
        currentEquity += t.pnl;
        if (currentEquity > peakEquity) {
          peakEquity = currentEquity;
        }
        const drawdown = peakEquity - currentEquity;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }

        if (t.pnl > 0) {
          winningTrades++;
          totalGains += t.pnl;
        } else if (t.pnl < 0) {
          losingTrades++;
          totalLosses += Math.abs(t.pnl);
        }
      }

      const totalTrades = trades.length;
      const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
      const netProfitPercent = initialCapital > 0 ? (netProfit / initialCapital) * 100 : 0;
      const maxDrawdownPercent = peakEquity > 0 ? (maxDrawdown / peakEquity) * 100 : 0;
      const profitFactor = totalLosses > 0 ? totalGains / totalLosses : totalGains > 0 ? 99.9 : 1.0;

      strategyStats = {
        netProfit,
        netProfitPercent,
        winRate,
        totalTrades,
        winningTrades,
        losingTrades,
        maxDrawdown,
        maxDrawdownPercent,
        profitFactor,
        initialCapital,
        finalEquity: currentEquity,
      };

      logs.push(`Backtest complete: ${totalTrades} trades, Win Rate: ${winRate.toFixed(1)}%, Net PnL: $${netProfit.toFixed(2)}`);
    }

    logs.push(`Script execution finished successfully (${plots.length} plots, ${hlines.length} levels, ${markers.length} signals)`);

    return {
      success: true,
      scriptName,
      scriptType,
      isOverlay,
      timeframe: timeframeSeconds,
      plots,
      hlines,
      markers,
      trades: trades.length > 0 ? trades : undefined,
      strategyStats,
      errors: [],
      logs,
      executionTimeMs: Math.round(performance.now() - startTime),
    };
  } catch (err: any) {
    errors.push({ line: 1, message: err?.message || 'Unexpected compilation/runtime error in Pine Engine' });
    return { ...defaultResult, errors, executionTimeMs: Math.round(performance.now() - startTime) };
  }
}

/**
 * Handles strategy.entry, strategy.close, and strategy.exit commands with trade lifecycle tracking
 */
function executeStrategyStatement(
  stmt: string,
  conditionSeries: boolean[] | null,
  candles: FormattedCandle[],
  trades: PineStrategyTrade[],
  markers: PineMarker[],
  defaultQty: number,
  setOpenPos: (pos: any) => void,
  getOpenPos: () => any
) {
  const match = stmt.match(/strategy\.(entry|close|exit)\s*\((.*)\)/i);
  if (!match) return;

  const action = match[1].toLowerCase();
  const { positional, named } = parseArguments(match[2]);

  const whenSeries = conditionSeries;
  const len = candles.length;

  if (action === 'entry') {
    const tradeLabel = named.id?.replace(/['"]/g, '') || positional[0]?.replace(/['"]/g, '') || 'Trade';
    const directionStr = (named.direction || positional[1] || 'strategy.long').toLowerCase();
    const isLong = directionStr.includes('long');

    for (let i = 0; i < len; i++) {
      if (whenSeries && !whenSeries[i]) continue;

      const currentPos = getOpenPos();
      const candle = candles[i];

      // Close opposite position if active
      if (currentPos && currentPos.type !== (isLong ? 'long' : 'short')) {
        const exitPrice = candle.close;
        const pnl = currentPos.type === 'long' ? (exitPrice - currentPos.entryPrice) * currentPos.qty : (currentPos.entryPrice - exitPrice) * currentPos.qty;
        const pnlPercent = (pnl / (currentPos.entryPrice * currentPos.qty)) * 100;

        trades.push({
          id: trades.length + 1,
          tradeId: `${currentPos.type.toUpperCase()}-${trades.length + 1}`,
          type: currentPos.type,
          entryTime: currentPos.entryTime,
          entryPrice: currentPos.entryPrice,
          exitTime: candle.time,
          exitPrice,
          quantity: currentPos.qty,
          pnl,
          pnlPercent,
          status: 'closed',
        });

        markers.push({
          time: candle.time,
          position: currentPos.type === 'long' ? 'aboveBar' : 'belowBar',
          color: '#f59e0b',
          shape: 'circle',
          text: `CLOSE ${currentPos.type.toUpperCase()}`,
        });

        setOpenPos(null);
      }

      // Enter new position if flat
      if (!getOpenPos()) {
        const newPos = {
          type: isLong ? 'long' : 'short',
          entryTime: candle.time,
          entryPrice: candle.close,
          qty: defaultQty,
        };
        setOpenPos(newPos);

        markers.push({
          time: candle.time,
          position: isLong ? 'belowBar' : 'aboveBar',
          color: isLong ? '#22c55e' : '#ef4444',
          shape: isLong ? 'arrowUp' : 'arrowDown',
          text: isLong ? `BUY (${tradeLabel})` : `SELL (${tradeLabel})`,
        });
      }
    }
  } else if (action === 'close' || action === 'exit') {
    for (let i = 0; i < len; i++) {
      if (whenSeries && !whenSeries[i]) continue;

      const currentPos = getOpenPos();
      if (currentPos) {
        const candle = candles[i];
        const exitPrice = candle.close;
        const pnl = currentPos.type === 'long' ? (exitPrice - currentPos.entryPrice) * currentPos.qty : (currentPos.entryPrice - exitPrice) * currentPos.qty;
        const pnlPercent = (pnl / (currentPos.entryPrice * currentPos.qty)) * 100;

        trades.push({
          id: trades.length + 1,
          tradeId: `${currentPos.type.toUpperCase()}-${trades.length + 1}`,
          type: currentPos.type,
          entryTime: currentPos.entryTime,
          entryPrice: currentPos.entryPrice,
          exitTime: candle.time,
          exitPrice,
          quantity: currentPos.qty,
          pnl,
          pnlPercent,
          status: 'closed',
        });

        markers.push({
          time: candle.time,
          position: currentPos.type === 'long' ? 'aboveBar' : 'belowBar',
          color: '#f59e0b',
          shape: 'circle',
          text: `EXIT`,
        });

        setOpenPos(null);
      }
    }
  }
}
