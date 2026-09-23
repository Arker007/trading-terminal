import { FormattedCandle } from '../types';
import {
  PineCompileError,
  PineExecutionResult,
  PineHLine,
  PineInputParam,
  PineMarker,
  PinePlot,
  PinePlotPoint,
  PineStrategyStats,
  PineStrategyTrade,
  PineFill,
  PineBgColor,
} from '../types/pine';

/**
 * Sanitizes and guarantees strictly ascending, deduplicated timestamps and valid numbers for chart rendering.
 */
export function sanitizePlotData(data: PinePlotPoint[]): PinePlotPoint[] {
  if (!data || !Array.isArray(data) || data.length === 0) return [];
  const map = new Map<number, number>();

  for (let i = 0; i < data.length; i++) {
    const pt = data[i];
    if (
      pt &&
      typeof pt.time === 'number' &&
      !isNaN(pt.time) &&
      typeof pt.value === 'number' &&
      !isNaN(pt.value) &&
      isFinite(pt.value)
    ) {
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
  if (!str) return [];
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
 * Splits ternary `cond ? trueVal : falseVal` taking into account nested ternary depth and brackets/quotes.
 */
export function splitTernary(expr: string): { cond: string; trueExpr: string; falseExpr: string } | null {
  if (!expr || !expr.includes('?') || !expr.includes(':')) return null;

  let depth = 0;
  let inQuotes = false;
  let quoteChar = '';
  let firstQIdx = -1;
  let matchingColonIdx = -1;
  let ternaryDepth = 0;

  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (inQuotes) {
      if (ch === quoteChar && expr[i - 1] !== '\\') {
        inQuotes = false;
      }
    } else {
      if (ch === '"' || ch === "'") {
        inQuotes = true;
        quoteChar = ch;
      } else if (charIsOpen(ch)) {
        depth++;
      } else if (charIsClose(ch)) {
        depth = Math.max(0, depth - 1);
      } else if (depth === 0) {
        if (ch === '?') {
          if (firstQIdx === -1) {
            firstQIdx = i;
          }
          ternaryDepth++;
        } else if (ch === ':') {
          if (firstQIdx !== -1) {
            ternaryDepth--;
            if (ternaryDepth === 0) {
              matchingColonIdx = i;
              break;
            }
          }
        }
      }
    }
  }

  if (firstQIdx !== -1 && matchingColonIdx !== -1 && matchingColonIdx > firstQIdx) {
    return {
      cond: expr.substring(0, firstQIdx).trim(),
      trueExpr: expr.substring(firstQIdx + 1, matchingColonIdx).trim(),
      falseExpr: expr.substring(matchingColonIdx + 1).trim(),
    };
  }
  return null;
}

function charIsOpen(ch: string): boolean {
  return ch === '(' || ch === '[' || ch === '{';
}

function charIsClose(ch: string): boolean {
  return ch === ')' || ch === ']' || ch === '}';
}

/**
 * Parses function call arguments into positional array and named object dictionary.
 */
export function parseArguments(argsStr: string): { positional: string[]; named: Record<string, string> } {
  if (!argsStr || !argsStr.trim()) return { positional: [], named: {} };
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

  // Handle color.new(color.red, 50) or color.new(#089981, 53)
  if (c.includes('color.new') || c.includes('color.rgb')) {
    const innerMatch = colorStr.match(/(?:color\.new|color\.rgb)\s*\((.*)\)/i);
    if (innerMatch) {
      const parts = splitTopLevel(innerMatch[1], ',');
      const baseRaw = parts[0]?.trim() || '';
      const transp = parts[1] ? parseFloat(parts[1]) : 0;
      let baseCol = baseRaw.startsWith('#') ? baseRaw : resolvePineColor(baseRaw, defaultGreen);
      if (baseCol.startsWith('#') && baseCol.length === 7) {
        const alpha = Math.max(0.1, Math.min(1, 1 - transp / 100));
        const r = parseInt(baseCol.slice(1, 3), 16);
        const g = parseInt(baseCol.slice(3, 5), 16);
        const b = parseInt(baseCol.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
      }
      return baseCol;
    }
  }

  // Named TradingView color constants
  if (c.includes('green') || c.includes('lime') || c.includes('089981')) return '#22c55e';
  if (c.includes('red') || c.includes('maroon') || c.includes('f23645')) return '#ef4444';
  if (c.includes('blue') || c.includes('navy') || c.includes('2962ff')) return '#3b82f6';
  if (c.includes('orange') || c.includes('ff9800')) return '#f97316';
  if (c.includes('yellow')) return '#eab308';
  if (c.includes('purple') || c.includes('e040fb')) return '#a855f7';
  if (c.includes('teal') || c.includes('aqua')) return '#14b8a6';
  if (c.includes('gray') || c.includes('grey') || c.includes('silver')) return '#94a3b8';
  if (c.includes('white')) return '#f8fafc';
  if (c.includes('black')) return '#0f172a';
  if (c.includes('fuchsia') || c.includes('magenta')) return '#d946ef';

  return defaultGreen ? '#22c55e' : '#ef4444';
}

// ----------------------------------------------------
// Technical Indicators Library (ta.* and legacy)
// ----------------------------------------------------

function calcSMA(series: (number | null)[], period: number): (number | null)[] {
  if (!series || !Array.isArray(series)) return [];
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
  if (!series || !Array.isArray(series)) return [];
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
  if (!series || !Array.isArray(series)) return [];
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
  if (!series || !Array.isArray(series)) return [];
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
  if (!series || !Array.isArray(series)) return [];
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

function calcALMA(series: (number | null)[], period: number = 9, offset: number = 0.85, sigma: number = 6): (number | null)[] {
  if (!series || !Array.isArray(series)) return [];
  const len = series.length;
  const result: (number | null)[] = new Array(len).fill(null);
  if (period <= 0 || len < period) return result;

  const m = offset * (period - 1);
  const s = period / sigma;
  const weights: number[] = [];
  let wSum = 0;

  for (let i = 0; i < period; i++) {
    const w = Math.exp(-Math.pow(i - m, 2) / (2 * Math.pow(s, 2)));
    weights.push(w);
    wSum += w;
  }

  for (let i = period - 1; i < len; i++) {
    let sum = 0;
    let valid = true;
    for (let j = 0; j < period; j++) {
      const v = series[i - (period - 1 - j)];
      if (v === null || isNaN(v)) {
        valid = false;
        break;
      }
      sum += v * weights[j];
    }
    if (valid && wSum !== 0) {
      result[i] = sum / wSum;
    }
  }
  return result;
}

function calcLinreg(series: (number | null)[], period: number = 14, offset: number = 0): (number | null)[] {
  if (!series || !Array.isArray(series)) return [];
  const len = series.length;
  const result: (number | null)[] = new Array(len).fill(null);
  if (period <= 0 || len < period) return result;

  for (let i = period - 1; i < len; i++) {
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    let valid = true;

    for (let j = 0; j < period; j++) {
      const y = series[i - (period - 1 - j)];
      if (y === null || isNaN(y)) {
        valid = false;
        break;
      }
      const x = j;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }

    if (valid) {
      const slope = (period * sumXY - sumX * sumY) / (period * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / period;
      result[i] = intercept + slope * (period - 1 - offset);
    }
  }
  return result;
}

function calcRSI(series: (number | null)[], period: number = 14): (number | null)[] {
  if (!series || !Array.isArray(series)) return [];
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
  if (!candles || !Array.isArray(candles) || candles.length === 0) return [];
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
  if (!candles || !Array.isArray(candles) || candles.length === 0) return [];
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

function calcPivotHigh(
  series: (number | null)[],
  leftBars: number = 10,
  rightBars: number = 10
): (number | null)[] {
  if (!series || !Array.isArray(series)) return [];
  const len = series.length;
  const result: (number | null)[] = new Array(len).fill(null);
  if (leftBars <= 0 || rightBars <= 0 || len < leftBars + rightBars + 1) return result;

  for (let i = leftBars + rightBars; i < len; i++) {
    const pIdx = i - rightBars;
    const pVal = series[pIdx];
    if (pVal === null || isNaN(pVal)) continue;

    let isPivot = true;
    for (let j = 1; j <= leftBars; j++) {
      const leftVal = series[pIdx - j];
      if (leftVal !== null && leftVal >= pVal) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) {
      for (let j = 1; j <= rightBars; j++) {
        const rightVal = series[pIdx + j];
        if (rightVal !== null && rightVal > pVal) {
          isPivot = false;
          break;
        }
      }
    }

    if (isPivot) {
      result[i] = pVal;
    }
  }
  return result;
}

function calcPivotLow(
  series: (number | null)[],
  leftBars: number = 10,
  rightBars: number = 10
): (number | null)[] {
  if (!series || !Array.isArray(series)) return [];
  const len = series.length;
  const result: (number | null)[] = new Array(len).fill(null);
  if (leftBars <= 0 || rightBars <= 0 || len < leftBars + rightBars + 1) return result;

  for (let i = leftBars + rightBars; i < len; i++) {
    const pIdx = i - rightBars;
    const pVal = series[pIdx];
    if (pVal === null || isNaN(pVal)) continue;

    let isPivot = true;
    for (let j = 1; j <= leftBars; j++) {
      const leftVal = series[pIdx - j];
      if (leftVal !== null && leftVal <= pVal) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) {
      for (let j = 1; j <= rightBars; j++) {
        const rightVal = series[pIdx + j];
        if (rightVal !== null && rightVal < pVal) {
          isPivot = false;
          break;
        }
      }
    }

    if (isPivot) {
      result[i] = pVal;
    }
  }
  return result;
}

function calcBollingerBands(
  series: (number | null)[],
  period: number = 20,
  mult: number = 2
): { upper: (number | null)[]; basis: (number | null)[]; lower: (number | null)[] } {
  if (!series || !Array.isArray(series)) {
    return { upper: [], basis: [], lower: [] };
  }
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
  if (!candles || !Array.isArray(candles) || candles.length === 0) {
    return { supertrend: [], direction: [] };
  }
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
  if (!series || !Array.isArray(series)) {
    return { macd: [], signal: [], hist: [] };
  }
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

function calcSAR(
  candles: FormattedCandle[],
  start: number = 0.02,
  inc: number = 0.02,
  max: number = 0.2
): (number | null)[] {
  if (!candles || !Array.isArray(candles)) return [];
  const len = candles.length;
  const result: (number | null)[] = new Array(len).fill(null);
  if (len < 2) return result;

  let isLong = candles[1].close >= candles[0].close;
  let af = start;
  let ep = isLong ? candles[0].high : candles[0].low;
  let sar = isLong ? candles[0].low : candles[0].high;

  result[0] = sar;

  for (let i = 1; i < len; i++) {
    const prevSar = sar;
    sar = prevSar + af * (ep - prevSar);

    if (isLong) {
      if (candles[i].low < sar) {
        isLong = false;
        sar = ep;
        af = start;
        ep = candles[i].low;
      } else {
        if (candles[i].high > ep) {
          ep = candles[i].high;
          af = Math.min(max, af + inc);
        }
        if (i >= 1 && sar > candles[i - 1].low) sar = candles[i - 1].low;
        if (i >= 2 && sar > candles[i - 2].low) sar = candles[i - 2].low;
      }
    } else {
      if (candles[i].high > sar) {
        isLong = true;
        sar = ep;
        af = start;
        ep = candles[i].high;
      } else {
        if (candles[i].low < ep) {
          ep = candles[i].low;
          af = Math.min(max, af + inc);
        }
        if (i >= 1 && sar < candles[i - 1].high) sar = candles[i - 1].high;
        if (i >= 2 && sar < candles[i - 2].high) sar = candles[i - 2].high;
      }
    }

    result[i] = sar;
  }

  return result;
}

/**
 * Extracts all `input()` declarations from Pine Script
 */
export function extractPineInputs(code: string): PineInputParam[] {
  if (!code) return [];
  const lines = code.split('\n');
  const inputs: PineInputParam[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('//')) continue;

    const assignMatch = line.match(/^([a-zA-Z0-9_]+)\s*=\s*(?:input(?:\.(?:int|float|bool|string|source|color|timeframe))?)\s*\((.*)\)/i);
    if (assignMatch) {
      const varName = assignMatch[1];
      const argsStr = assignMatch[2];
      const { positional, named } = parseArguments(argsStr);

      const title = (named.title || (positional[1] && !positional[1].includes('group') ? positional[1] : '') || varName).replace(/['"]/g, '');
      const rawDefval = named.defval !== undefined ? named.defval : positional[0] !== undefined ? positional[0] : '14';
      const cleanDef = rawDefval.replace(/['"]/g, '').trim();

      let type: 'int' | 'float' | 'bool' | 'string' | 'source' | 'color' = 'int';
      let defval: any = cleanDef;

      if (line.includes('input.bool') || cleanDef === 'true' || cleanDef === 'false') {
        type = 'bool';
        defval = cleanDef === 'true';
      } else if (line.includes('input.color') || cleanDef.startsWith('#') || cleanDef.includes('color.')) {
        type = 'color';
        defval = resolvePineColor(cleanDef);
      } else if (line.includes('input.string') || line.includes('input.timeframe') || isNaN(Number(cleanDef))) {
        type = 'string';
        defval = cleanDef;
      } else {
        const num = parseFloat(cleanDef);
        if (cleanDef.includes('.') || line.includes('input.float')) {
          type = 'float';
          defval = isNaN(num) ? 0.0 : num;
        } else {
          type = 'int';
          defval = isNaN(num) ? 0 : Math.round(num);
        }
      }

      inputs.push({
        id: `input-${varName}`,
        varName,
        title,
        type,
        defval,
        currentVal: defval,
        minval: named.minval ? parseFloat(named.minval) : undefined,
        maxval: named.maxval ? parseFloat(named.maxval) : undefined,
        step: named.step ? parseFloat(named.step) : undefined,
        group: named.group?.replace(/['"]/g, ''),
        tooltip: named.tooltip?.replace(/['"]/g, ''),
      });
    }
  }

  return inputs;
}

/**
 * Preprocesses Pine Script code to normalize v1-v5 syntax into standard AST statements
 */
export function preprocessPineScript(code: string): string[] {
  if (!code) return [];
  const rawLines = code.split('\n');
  const statements: string[] = [];
  let currentStmt = '';
  let inTypeDefinition = false;

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i];
    let commentIdx = -1;
    let inQ = false;
    let qC = '';

    for (let cIdx = 0; cIdx < line.length - 1; cIdx++) {
      const ch = line[cIdx];
      if (inQ) {
        if (ch === qC && line[cIdx - 1] !== '\\') inQ = false;
      } else {
        if (ch === '"' || ch === "'") {
          inQ = true;
          qC = ch;
        } else if (ch === '/' && line[cIdx + 1] === '/') {
          commentIdx = cIdx;
          break;
        }
      }
    }

    if (commentIdx !== -1) {
      line = line.substring(0, commentIdx);
    }

    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip custom user-defined type definitions cleanly
    if (trimmed.startsWith('type ')) {
      inTypeDefinition = true;
      continue;
    }
    if (inTypeDefinition) {
      if (/^\s{2,}/.test(line) || /^(float|int|bool|string|box|line|label)\s+/i.test(trimmed)) {
        continue;
      } else {
        inTypeDefinition = false;
      }
    }

    // Normalizing legacy v1-v4 aliases to modern v5 syntax
    const normalized = trimmed
      .replace(/\bstudy\s*\(/g, 'indicator(')
      .replace(/\biff\s*\(/g, 'ta.iff(')
      .replace(/\bsma\s*\(/g, 'ta.sma(')
      .replace(/\bema\s*\(/g, 'ta.ema(')
      .replace(/\bwma\s*\(/g, 'ta.wma(')
      .replace(/\brma\s*\(/g, 'ta.rma(')
      .replace(/\bhma\s*\(/g, 'ta.hma(')
      .replace(/\brsi\s*\(/g, 'ta.rsi(')
      .replace(/\bmacd\s*\(/g, 'ta.macd(')
      .replace(/\blowest\s*\(/g, 'ta.lowest(')
      .replace(/\bhighest\s*\(/g, 'ta.highest(')
      .replace(/\batr\s*\(/g, 'ta.atr(')
      .replace(/\bpivothigh\s*\(/g, 'ta.pivothigh(')
      .replace(/\bpivotlow\s*\(/g, 'ta.pivotlow(')
      .replace(/\bcrossover\s*\(/g, 'ta.crossover(')
      .replace(/\bcrossunder\s*\(/g, 'ta.crossunder(')
      .replace(/\bcross\s*\(/g, 'ta.cross(')
      .replace(/\bsupertrend\s*\(/g, 'ta.supertrend(')
      .replace(/\bvaluewhen\s*\(/g, 'ta.valuewhen(')
      .replace(/\bbarssince\s*\(/g, 'ta.barssince(')
      .replace(/\bchange\s*\(/g, 'ta.change(')
      .replace(/\bstoch\s*\(/g, 'ta.stoch(')
      .replace(/\bcci\s*\(/g, 'ta.cci(');

    const isContinuation =
      currentStmt !== '' &&
      (/(?:[,+\-*\/?:=]|and|or)\s*$/i.test(currentStmt) || /^(?:[,+\-*\/?:=]|and|or)\s*/i.test(normalized));

    if (isContinuation) {
      currentStmt += ' ' + normalized;
    } else {
      if (currentStmt) {
        statements.push(currentStmt);
      }
      currentStmt = normalized;
    }
  }

  if (currentStmt) {
    statements.push(currentStmt);
  }

  return statements;
}

/**
 * Main Pine Script Execution Engine
 */
export function executePineScript(
  code: string,
  candles: FormattedCandle[],
  timeframeSeconds: number = 60,
  customInputOverrides: Record<string, any> = {}
): PineExecutionResult {
  const startTime = performance.now();
  const errors: PineCompileError[] = [];
  const logs: string[] = [];
  const plots: PinePlot[] = [];
  const hlines: PineHLine[] = [];
  const fills: PineFill[] = [];
  const bgcolors: PineBgColor[] = [];
  const markers: PineMarker[] = [];
  const trades: PineStrategyTrade[] = [];

  const defaultResult: PineExecutionResult = {
    success: false,
    scriptName: 'Pine Script',
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

  if (!candles || !Array.isArray(candles) || candles.length === 0) {
    errors.push({ line: 1, message: 'Market candle history is required for script execution.' });
    return { ...defaultResult, errors };
  }

  try {
    const len = candles.length;
    const times = candles.map((c) => c?.time ?? 0);
    const opens = candles.map((c) => c?.open ?? 0);
    const highs = candles.map((c) => c?.high ?? 0);
    const lows = candles.map((c) => c?.low ?? 0);
    const closes = candles.map((c) => c?.close ?? 0);
    const volumes = candles.map((c) => c?.volume ?? 1);
    const hl2 = candles.map((c) => ((c?.high ?? 0) + (c?.low ?? 0)) / 2);
    const hlc3 = candles.map((c) => ((c?.high ?? 0) + (c?.low ?? 0) + (c?.close ?? 0)) / 3);
    const ohlc4 = candles.map((c) => ((c?.open ?? 0) + (c?.high ?? 0) + (c?.low ?? 0) + (c?.close ?? 0)) / 4);

    const env: Record<string, any> = {
      open: opens,
      high: highs,
      low: lows,
      close: closes,
      volume: volumes,
      hl2,
      hlc3,
      ohlc4,
      time: times,
      bar_index: Array.from({ length: len }, (_, i) => i),
      'timeframe.period': `${timeframeSeconds}S`,
      'timeframe.multiplier': timeframeSeconds >= 60 ? Math.floor(timeframeSeconds / 60) : 1,
      'timeframe.isintraday': timeframeSeconds < 86400,
      'timeframe.isdaily': timeframeSeconds === 86400,
      'timeframe.isweekly': timeframeSeconds === 604800,
      'timeframe.ismonthly': timeframeSeconds >= 2592000,
      'syminfo.ticker': 'CRYPTO_IDX',
      'barstate.islast': Array.from({ length: len }, (_, i) => i === len - 1),
      'barstate.isfirst': Array.from({ length: len }, (_, i) => i === 0),
      'barstate.isconfirmed': new Array(len).fill(true),
      'b.o': opens,
      'b.h': highs,
      'b.l': lows,
      'b.c': closes,
      'b.v': volumes,
      'b.i': Array.from({ length: len }, (_, i) => i),
    };

    let scriptName = 'Custom Pine Script';
    let scriptType: 'indicator' | 'strategy' = 'indicator';
    let isOverlay = true;
    let initialCapital = 10000;
    let defaultQty = 1;

    // Helper: Safely converts any value/series into a strictly typed Array of length `len`
    const toSeries = (val: any): any[] => {
      if (Array.isArray(val)) {
        if (val.length === len) return val;
        const res = new Array(len).fill(null);
        for (let i = 0; i < Math.min(len, val.length); i++) res[i] = val[i];
        return res;
      }
      if (val === null || val === undefined || val === 'na') {
        return new Array(len).fill(null);
      }
      return new Array(len).fill(val);
    };

    // 1. Extract dynamic inputs
    const extractedInputs = extractPineInputs(code);
    for (const inp of extractedInputs) {
      const overrideVal = customInputOverrides[inp.varName];
      const val = overrideVal !== undefined ? overrideVal : inp.defval;
      inp.currentVal = val;
      env[inp.varName] = val;
    }

    // 2. Preprocess statements
    const statements = preprocessPineScript(code);

    // Evaluate expression helper
    const evalExpr = (expr: string): (number | null)[] | boolean[] | any => {
      if (!expr) return null;
      let trimmed = expr.trim();
      if (!trimmed) return null;

      // Handle outer parentheses (e.g. `(a > b)`)
      if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
        let depth = 0;
        let isBalanced = true;
        for (let i = 0; i < trimmed.length - 1; i++) {
          if (trimmed[i] === '(') depth++;
          else if (trimmed[i] === ')') depth--;
          if (depth === 0) {
            isBalanced = false;
            break;
          }
        }
        if (isBalanced) {
          return evalExpr(trimmed.slice(1, -1));
        }
      }

      if (trimmed === 'true') return new Array(len).fill(true);
      if (trimmed === 'false') return new Array(len).fill(false);
      if (trimmed === 'na') return new Array(len).fill(null);

      // Direct numerical literals
      const numDirect = parseFloat(trimmed);
      if (!isNaN(numDirect) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
        return new Array(len).fill(numDirect);
      }

      // String literals (e.g. "close", "shape.arrowup")
      if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1);
      }

      // Check environment variables
      if (env[trimmed] !== undefined) {
        if (Array.isArray(env[trimmed])) return env[trimmed];
        if (typeof env[trimmed] === 'number') return new Array(len).fill(env[trimmed]);
        if (typeof env[trimmed] === 'boolean') return new Array(len).fill(env[trimmed]);
        return env[trimmed];
      }

      // Unary `not` or `!`
      if (trimmed.startsWith('not ') || trimmed.startsWith('!')) {
        const inner = trimmed.startsWith('not ') ? trimmed.slice(4).trim() : trimmed.slice(1).trim();
        const innerVal = evalExpr(inner);
        const innerSeries = toSeries(innerVal);
        return innerSeries.map((v) => !v);
      }

      // Historical series offset: e.g. `close[1]` or `high[2]` or `b.i[1]`
      const histMatch = trimmed.match(/^([a-zA-Z0-9_.]+)\s*\[\s*(\d+)\s*\]$/);
      if (histMatch) {
        const base = histMatch[1];
        const offset = parseInt(histMatch[2], 10);
        const baseSeries = evalExpr(base);
        const series = toSeries(baseSeries);
        const out = new Array(len).fill(null);
        for (let i = offset; i < len; i++) {
          out[i] = series[i - offset];
        }
        return out;
      }

      // Ternary Conditional: `cond ? trueVal : falseVal`
      const ternary = splitTernary(trimmed);
      if (ternary) {
        const condSeries = toSeries(evalExpr(ternary.cond));
        const trueSeries = toSeries(evalExpr(ternary.trueExpr));
        const falseSeries = toSeries(evalExpr(ternary.falseExpr));

        const out = new Array(len).fill(null);
        for (let i = 0; i < len; i++) {
          out[i] = condSeries[i] ? trueSeries[i] : falseSeries[i];
        }
        return out;
      }

      // Logical `or`
      const orParts = splitTopLevel(trimmed, 'or');
      if (orParts.length > 1) {
        let accSeries = toSeries(evalExpr(orParts[0]));
        for (let p = 1; p < orParts.length; p++) {
          const nextSeries = toSeries(evalExpr(orParts[p]));
          accSeries = accSeries.map((v: any, idx: number) => Boolean(v) || Boolean(nextSeries[idx]));
        }
        return accSeries;
      }

      // Logical `and`
      const andParts = splitTopLevel(trimmed, 'and');
      if (andParts.length > 1) {
        let accSeries = toSeries(evalExpr(andParts[0]));
        for (let p = 1; p < andParts.length; p++) {
          const nextSeries = toSeries(evalExpr(andParts[p]));
          accSeries = accSeries.map((v: any, idx: number) => Boolean(v) && Boolean(nextSeries[idx]));
        }
        return accSeries;
      }

      // Comparison operators
      for (const op of ['==', '!=', '>=', '<=', '>', '<']) {
        const cmpParts = splitTopLevel(trimmed, op);
        if (cmpParts.length === 2) {
          const leftSeries = toSeries(evalExpr(cmpParts[0]));
          const rightSeries = toSeries(evalExpr(cmpParts[1]));
          const out: boolean[] = new Array(len).fill(false);

          for (let i = 0; i < len; i++) {
            const l = leftSeries[i];
            const r = rightSeries[i];
            if (l === null || r === null || l === undefined || r === undefined) continue;

            if (op === '==') out[i] = l === r;
            else if (op === '!=') out[i] = l !== r;
            else if (op === '>=') out[i] = l >= r;
            else if (op === '<=') out[i] = l <= r;
            else if (op === '>') out[i] = l > r;
            else if (op === '<') out[i] = l < r;
          }
          return out;
        }
      }

      // Addition / Subtraction
      for (const op of ['+', '-']) {
        const parts = splitTopLevel(trimmed, op);
        if (parts.length > 1 && parts[0] !== '') {
          let accSeries = toSeries(evalExpr(parts[0]));
          for (let p = 1; p < parts.length; p++) {
            const nextSeries = toSeries(evalExpr(parts[p]));
            accSeries = accSeries.map((v: any, idx: number) => {
              const n = nextSeries[idx];
              return v !== null && n !== null && typeof v === 'number' && typeof n === 'number'
                ? op === '+'
                  ? v + n
                  : v - n
                : null;
            });
          }
          return accSeries;
        }
      }

      // Multiplication / Division / Modulo
      for (const op of ['*', '/', '%']) {
        const parts = splitTopLevel(trimmed, op);
        if (parts.length > 1) {
          let accSeries = toSeries(evalExpr(parts[0]));
          for (let p = 1; p < parts.length; p++) {
            const nextSeries = toSeries(evalExpr(parts[p]));
            accSeries = accSeries.map((v: any, idx: number) => {
              const n = nextSeries[idx];
              if (v === null || n === null || typeof v !== 'number' || typeof n !== 'number') return null;
              if (op === '*') return v * n;
              if (op === '/') return n !== 0 ? v / n : null;
              if (op === '%') return n !== 0 ? v % n : null;
              return null;
            });
          }
          return accSeries;
        }
      }

      // Function calls `fn(...)`
      const fnMatch = trimmed.match(/^([a-zA-Z0-9_.]+)\s*\((.*)\)$/);
      if (fnMatch) {
        const fn = fnMatch[1].toLowerCase();
        const { positional, named } = parseArguments(fnMatch[2]);

        if (fn === 'nz' || fn === 'math.nz') {
          const src = toSeries(evalExpr(named.source || positional[0] || 'close'));
          const repl = parseFloat(named.replacement || positional[1] || '0') || 0;
          return src.map((v: any) => (v === null || v === undefined || isNaN(v) ? repl : v));
        }

        if (fn === 'na' || fn === 'ta.na' || fn === 'math.na') {
          const src = toSeries(evalExpr(named.source || positional[0] || 'close'));
          return src.map((v: any) => v === null || v === undefined || (typeof v === 'number' && isNaN(v)));
        }

        if (fn === 'ta.sma' || fn === 'sma') {
          const src = toSeries(evalExpr(named.source || positional[0] || 'close'));
          const p = parseInt(named.length || positional[1] || '14', 10) || 14;
          return calcSMA(src, p);
        }

        if (fn === 'ta.ema' || fn === 'ema') {
          const src = toSeries(evalExpr(named.source || positional[0] || 'close'));
          const p = parseInt(named.length || positional[1] || '14', 10) || 14;
          return calcEMA(src, p);
        }

        if (fn === 'ta.wma' || fn === 'wma') {
          const src = toSeries(evalExpr(named.source || positional[0] || 'close'));
          const p = parseInt(named.length || positional[1] || '14', 10) || 14;
          return calcWMA(src, p);
        }

        if (fn === 'ta.rma' || fn === 'rma') {
          const src = toSeries(evalExpr(named.source || positional[0] || 'close'));
          const p = parseInt(named.length || positional[1] || '14', 10) || 14;
          return calcRMA(src, p);
        }

        if (fn === 'ta.hma' || fn === 'hma') {
          const src = toSeries(evalExpr(named.source || positional[0] || 'close'));
          const p = parseInt(named.length || positional[1] || '14', 10) || 14;
          return calcHMA(src, p);
        }

        if (fn === 'ta.alma' || fn === 'alma') {
          const src = toSeries(evalExpr(named.source || positional[0] || 'close'));
          const p = parseInt(named.length || positional[1] || '9', 10) || 9;
          const offset = parseFloat(named.offset || positional[2] || '0.85') || 0.85;
          const sigma = parseFloat(named.sigma || positional[3] || '6') || 6;
          return calcALMA(src, p, offset, sigma);
        }

        if (fn === 'ta.linreg' || fn === 'linreg') {
          const src = toSeries(evalExpr(named.source || positional[0] || 'close'));
          const p = parseInt(named.length || positional[1] || '14', 10) || 14;
          const offset = parseInt(named.offset || positional[2] || '0', 10) || 0;
          return calcLinreg(src, p, offset);
        }

        if (fn === 'ta.rsi' || fn === 'rsi') {
          const src = toSeries(evalExpr(named.source || positional[0] || 'close'));
          const p = parseInt(named.length || positional[1] || (positional.length === 1 ? positional[0] : '14'), 10) || 14;
          return calcRSI(src, p);
        }

        if (fn === 'ta.atr' || fn === 'atr') {
          const p = parseInt(named.length || positional[0] || '14', 10) || 14;
          return calcATR(candles, p);
        }

        if (fn === 'ta.tr' || fn === 'tr') {
          return calcTR(candles);
        }

        if (fn === 'ta.pivothigh' || fn === 'pivothigh') {
          const src = positional.length >= 3 ? toSeries(evalExpr(positional[0])) : highs;
          const leftBars = parseInt(positional.length >= 3 ? positional[1] : named.leftbars || positional[0] || '10', 10) || 10;
          const rightBars = parseInt(positional.length >= 3 ? positional[2] : named.rightbars || positional[1] || '10', 10) || 10;
          return calcPivotHigh(src, leftBars, rightBars);
        }

        if (fn === 'ta.pivotlow' || fn === 'pivotlow') {
          const src = positional.length >= 3 ? toSeries(evalExpr(positional[0])) : lows;
          const leftBars = parseInt(positional.length >= 3 ? positional[1] : named.leftbars || positional[0] || '10', 10) || 10;
          const rightBars = parseInt(positional.length >= 3 ? positional[2] : named.rightbars || positional[1] || '10', 10) || 10;
          return calcPivotLow(src, leftBars, rightBars);
        }

        if (fn === 'ta.sar' || fn === 'sar') {
          const start = parseFloat(named.start || positional[0] || '0.02') || 0.02;
          const inc = parseFloat(named.inc || positional[1] || '0.02') || 0.02;
          const max = parseFloat(named.max || positional[2] || '0.2') || 0.2;
          return calcSAR(candles, start, inc, max);
        }

        if (fn === 'ta.highest' || fn === 'highest') {
          const src = toSeries(evalExpr(named.source || (positional.length >= 2 ? positional[0] : 'high')));
          const p = parseInt(named.length || (positional.length >= 2 ? positional[1] : positional[0] || '14'), 10) || 14;
          const out = new Array(len).fill(null);
          for (let i = p - 1; i < len; i++) {
            let maxVal = -Infinity;
            for (let j = 0; j < p; j++) {
              const v = src[i - j];
              if (v !== null && !isNaN(v) && v > maxVal) maxVal = v;
            }
            if (maxVal !== -Infinity) out[i] = maxVal;
          }
          return out;
        }

        if (fn === 'ta.lowest' || fn === 'lowest') {
          const src = toSeries(evalExpr(named.source || (positional.length >= 2 ? positional[0] : 'low')));
          const p = parseInt(named.length || (positional.length >= 2 ? positional[1] : positional[0] || '14'), 10) || 14;
          const out = new Array(len).fill(null);
          for (let i = p - 1; i < len; i++) {
            let minVal = Infinity;
            for (let j = 0; j < p; j++) {
              const v = src[i - j];
              if (v !== null && !isNaN(v) && v < minVal) minVal = v;
            }
            if (minVal !== Infinity) out[i] = minVal;
          }
          return out;
        }

        if (fn === 'ta.crossover' || fn === 'crossover') {
          const a = toSeries(evalExpr(named.source1 || positional[0] || 'close'));
          const b = toSeries(evalExpr(named.source2 || positional[1] || 'open'));
          const out: boolean[] = new Array(len).fill(false);
          for (let i = 1; i < len; i++) {
            const pA = a[i - 1];
            const pB = b[i - 1];
            const cA = a[i];
            const cB = b[i];
            if (pA !== null && pB !== null && cA !== null && cB !== null) {
              out[i] = pA <= pB && cA > cB;
            }
          }
          return out;
        }

        if (fn === 'ta.crossunder' || fn === 'crossunder') {
          const a = toSeries(evalExpr(named.source1 || positional[0] || 'close'));
          const b = toSeries(evalExpr(named.source2 || positional[1] || 'open'));
          const out: boolean[] = new Array(len).fill(false);
          for (let i = 1; i < len; i++) {
            const pA = a[i - 1];
            const pB = b[i - 1];
            const cA = a[i];
            const cB = b[i];
            if (pA !== null && pB !== null && cA !== null && cB !== null) {
              out[i] = pA >= pB && cA < cB;
            }
          }
          return out;
        }

        if (fn === 'ta.cross' || fn === 'cross') {
          const a = toSeries(evalExpr(named.source1 || positional[0] || 'close'));
          const b = toSeries(evalExpr(named.source2 || positional[1] || 'open'));
          const out: boolean[] = new Array(len).fill(false);
          for (let i = 1; i < len; i++) {
            const pA = a[i - 1];
            const pB = b[i - 1];
            const cA = a[i];
            const cB = b[i];
            if (pA !== null && pB !== null && cA !== null && cB !== null) {
              out[i] = (pA <= pB && cA > cB) || (pA >= pB && cA < cB);
            }
          }
          return out;
        }

        if (fn === 'ta.change' || fn === 'change') {
          const src = toSeries(evalExpr(named.source || positional[0] || 'close'));
          const p = parseInt(named.length || positional[1] || '1', 10) || 1;
          const out = new Array(len).fill(null);
          for (let i = p; i < len; i++) {
            if (src[i] !== null && src[i - p] !== null) {
              out[i] = src[i]! - src[i - p]!;
            }
          }
          return out;
        }

        if (fn === 'ta.valuewhen' || fn === 'valuewhen') {
          const cond = toSeries(evalExpr(named.condition || positional[0] || 'true'));
          const src = toSeries(evalExpr(named.source || positional[1] || 'close'));
          const out = new Array(len).fill(null);
          let lastVal: any = null;
          for (let i = 0; i < len; i++) {
            if (cond[i]) {
              lastVal = src[i];
            }
            out[i] = lastVal;
          }
          return out;
        }

        if (fn === 'ta.barssince' || fn === 'barssince') {
          const cond = toSeries(evalExpr(named.condition || positional[0] || 'true'));
          const out = new Array(len).fill(null);
          let bars = -1;
          for (let i = 0; i < len; i++) {
            if (cond[i]) {
              bars = 0;
            } else if (bars >= 0) {
              bars++;
            }
            out[i] = bars >= 0 ? bars : null;
          }
          return out;
        }

        if (['math.abs', 'math.max', 'math.min', 'math.sqrt', 'math.pow', 'math.round', 'math.floor', 'math.ceil', 'math.sign'].includes(fn)) {
          const a1 = toSeries(evalExpr(positional[0] || '0'));
          const a2 = positional[1] ? toSeries(evalExpr(positional[1])) : null;
          return a1.map((v: any, idx: number) => {
            const v2 = a2 ? a2[idx] : 0;
            if (v === null || typeof v !== 'number' || isNaN(v)) return null;
            if (fn === 'math.abs') return Math.abs(v);
            if (fn === 'math.sqrt') return v >= 0 ? Math.sqrt(v) : null;
            if (fn === 'math.round') return Math.round(v);
            if (fn === 'math.floor') return Math.floor(v);
            if (fn === 'math.ceil') return Math.ceil(v);
            if (fn === 'math.sign') return Math.sign(v);
            if (fn === 'math.max') return typeof v2 === 'number' ? Math.max(v, v2) : v;
            if (fn === 'math.min') return typeof v2 === 'number' ? Math.min(v, v2) : v;
            if (fn === 'math.pow') return typeof v2 === 'number' ? Math.pow(v, v2) : v;
            return v;
          });
        }
      }

      return null;
    };

    // 3. First Pass: Detect Script Header
    for (const stmt of statements) {
      if (stmt.startsWith('indicator(') || stmt.startsWith('study(')) {
        scriptType = 'indicator';
        const match = stmt.match(/(?:indicator|study)\s*\((.*)\)/i);
        if (match) {
          const { positional, named } = parseArguments(match[1]);
          if (positional[0]) scriptName = positional[0].replace(/['"]/g, '');
          if (named.title) scriptName = named.title.replace(/['"]/g, '');
          if (named.overlay !== undefined) isOverlay = named.overlay === 'true' || named.overlay === '1';
        }
        logs.push(`Loaded indicator: "${scriptName}" (Overlay: ${isOverlay})`);
        break;
      } else if (stmt.startsWith('strategy(')) {
        scriptType = 'strategy';
        const match = stmt.match(/strategy\s*\((.*)\)/i);
        if (match) {
          const { positional, named } = parseArguments(match[1]);
          if (positional[0]) scriptName = positional[0].replace(/['"]/g, '');
          if (named.title) scriptName = named.title.replace(/['"]/g, '');
          if (named.overlay !== undefined) isOverlay = named.overlay === 'true' || named.overlay === '1';
          if (named.initial_capital) initialCapital = parseFloat(named.initial_capital) || 10000;
          if (named.default_qty_value) defaultQty = parseFloat(named.default_qty_value) || 1;
        }
        logs.push(`Loaded strategy: "${scriptName}" (Overlay: ${isOverlay}, Capital: $${initialCapital})`);
        break;
      }
    }

    // 4. Support and Resistance Signals MTF / Pivot S&R Engine Support
    const isSRScript =
      code.includes('Support and Resistance Signals MTF') ||
      code.includes('LuxAlgo - Support Resistance') ||
      (code.includes('ta.pivothigh') && code.includes('box.new'));

    if (isSRScript) {
      const srLN = typeof env['srLN'] === 'number' && env['srLN'] > 0 ? env['srLN'] : 15;
      const swSH = env['swSH'] || 'Tiny';

      const pivotHighs = calcPivotHigh(highs, srLN, srLN);
      const pivotLows = calcPivotLow(lows, srLN, srLN);

      const resLine: (number | null)[] = new Array(len).fill(null);
      const supLine: (number | null)[] = new Array(len).fill(null);

      let currentRes: number | null = null;
      let currentSup: number | null = null;
      let resBroken = false;
      let supBroken = false;
      let lastBreakoutBar = -999;
      let lastTestBar = -999;

      for (let i = 0; i < len; i++) {
        const c = closes[i];
        const h = highs[i];
        const l = lows[i];

        // Confirmed Pivot High
        if (pivotHighs[i] !== null) {
          const phIdx = Math.max(0, i - srLN);
          const phVal = pivotHighs[i]!;
          currentRes = phVal;
          resBroken = false;

          if (swSH !== 'None' && phIdx < len) {
            markers.push({
              time: times[phIdx],
              position: 'aboveBar',
              color: '#ef4444',
              shape: 'arrowDown',
              text: '◈ Swing High',
            });
          }
        }

        // Confirmed Pivot Low
        if (pivotLows[i] !== null) {
          const plIdx = Math.max(0, i - srLN);
          const plVal = pivotLows[i]!;
          currentSup = plVal;
          supBroken = false;

          if (swSH !== 'None' && plIdx < len) {
            markers.push({
              time: times[plIdx],
              position: 'belowBar',
              color: '#22c55e',
              shape: 'arrowUp',
              text: '◈ Swing Low',
            });
          }
        }

        // Bullish Breakout (once per resistance level with minimum 10-bar cooldown)
        if (currentRes !== null && !resBroken && c > currentRes && i - lastBreakoutBar > 10) {
          resBroken = true;
          lastBreakoutBar = i;
          markers.push({
            time: times[i],
            position: 'belowBar',
            color: '#22c55e',
            shape: 'arrowUp',
            text: '▲ B (Bull Breakout)',
          });
        }

        // Bearish Breakout (once per support level with minimum 10-bar cooldown)
        if (currentSup !== null && !supBroken && c < currentSup && i - lastBreakoutBar > 10) {
          supBroken = true;
          lastBreakoutBar = i;
          markers.push({
            time: times[i],
            position: 'aboveBar',
            color: '#ef4444',
            shape: 'arrowDown',
            text: '▼ B (Bear Breakout)',
          });
        }

        // Rejection / Retest of Resistance (single marker when wick tests zone)
        if (
          currentRes !== null &&
          !resBroken &&
          h >= currentRes &&
          c < currentRes &&
          i - lastTestBar > 15 &&
          i - lastBreakoutBar > 10
        ) {
          lastTestBar = i;
          markers.push({
            time: times[i],
            position: 'aboveBar',
            color: '#a855f7',
            shape: 'arrowDown',
            text: 'T (Test Res)',
          });
        }

        // Rejection / Retest of Support (single marker when wick tests zone)
        if (
          currentSup !== null &&
          !supBroken &&
          l <= currentSup &&
          c > currentSup &&
          i - lastTestBar > 15 &&
          i - lastBreakoutBar > 10
        ) {
          lastTestBar = i;
          markers.push({
            time: times[i],
            position: 'belowBar',
            color: '#3b82f6',
            shape: 'arrowUp',
            text: 'R (Retest Sup)',
          });
        }

        if (currentRes !== null && !resBroken) {
          resLine[i] = currentRes;
        }
        if (currentSup !== null && !supBroken) {
          supLine[i] = currentSup;
        }
      }

      // Add Support & Resistance plots to chart
      plots.push({
        id: 'plot-res-line',
        title: 'Resistance Level',
        color: '#ef4444',
        lineWidth: 2,
        style: 'line',
        data: sanitizePlotData(times.map((t, idx) => ({ time: t, value: resLine[idx]! })).filter((p) => p.value !== null)),
      });

      plots.push({
        id: 'plot-sup-line',
        title: 'Support Level',
        color: '#22c55e',
        lineWidth: 2,
        style: 'line',
        data: sanitizePlotData(times.map((t, idx) => ({ time: t, value: supLine[idx]! })).filter((p) => p.value !== null)),
      });

      logs.push(`LuxAlgo S&R MTF computed: Support Levels, Resistance Levels, and ${markers.length} key structural signals.`);
    }

    let openPosition: { type: 'long' | 'short'; entryTime: number; entryPrice: number; qty: number } | null = null;

    // 5. Statement execution loop
    for (const stmt of statements) {
      if (
        stmt.startsWith('//@version') ||
        stmt.startsWith('indicator(') ||
        stmt.startsWith('study(') ||
        stmt.startsWith('strategy(') ||
        stmt.startsWith('alertcondition(') ||
        stmt.includes('=>')
      ) {
        continue;
      }

      if (stmt.startsWith('hline(')) {
        const match = stmt.match(/^hline\s*\((.*)\)$/i);
        if (match) {
          const { positional, named } = parseArguments(match[1]);
          const price = parseFloat(named.price || positional[0] || '0') || 0;
          const title = named.title?.replace(/['"]/g, '') || positional[1]?.replace(/['"]/g, '') || `Level ${price}`;
          const color = resolvePineColor(named.color || positional[2], false);
          hlines.push({
            id: `hline-${hlines.length + 1}`,
            price,
            title,
            color,
            lineStyle: 'dashed',
          });
        }
        continue;
      }

      if (stmt.startsWith('fill(')) {
        const match = stmt.match(/^fill\s*\((.*)\)$/i);
        if (match) {
          const { positional, named } = parseArguments(match[1]);
          const p1 = named.plot1 || positional[0];
          const p2 = named.plot2 || positional[1];
          const color = resolvePineColor(named.color || positional[2] || 'rgba(59, 130, 246, 0.1)');
          fills.push({
            id: `fill-${fills.length + 1}`,
            plot1Id: p1?.replace(/['"]/g, '') || '',
            plot2Id: p2?.replace(/['"]/g, '') || '',
            color,
          });
        }
        continue;
      }

      if (stmt.startsWith('bgcolor(')) {
        const match = stmt.match(/^bgcolor\s*\((.*)\)$/i);
        if (match) {
          const { positional, named } = parseArguments(match[1]);
          const colExpr = named.color || positional[0];
          const colorSeries = toSeries(evalExpr(colExpr));
          for (let i = 0; i < len; i++) {
            const c = colorSeries[i];
            if (c && c !== 'na' && typeof c === 'string') {
              bgcolors.push({ time: times[i], color: resolvePineColor(c) });
            }
          }
        }
        continue;
      }

      if (/^plot\s*\(/i.test(stmt)) {
        const match = stmt.match(/^plot\s*\((.*)\)$/i);
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

          const seriesData = toSeries(evalExpr(seriesExpr));
          const rawPoints: PinePlotPoint[] = [];
          for (let i = 0; i < len; i++) {
            const v = seriesData[i];
            if (v !== null && !isNaN(v) && isFinite(v)) {
              rawPoints.push({ time: times[i], value: v });
            }
          }
          plots.push({
            id: `plot-${plots.length + 1}`,
            title: plotTitle,
            color,
            lineWidth,
            style: isHistogram ? 'histogram' : 'line',
            data: sanitizePlotData(rawPoints),
          });
        }
        continue;
      }

      if (/^(?:plotshape|plotchar|plotarrow)\s*\(/i.test(stmt)) {
        const match = stmt.match(/^(?:plotshape|plotchar|plotarrow)\s*\((.*)\)$/i);
        if (match) {
          const { positional, named } = parseArguments(match[1]);
          const condExpr = named.condition || positional[0] || 'false';
          const condSeries = toSeries(evalExpr(condExpr));

          const styleStr = (named.style || positional[2] || '').toLowerCase();
          const titleStr = (named.title || '').toLowerCase();
          const isSell = styleStr.includes('labeldown') || styleStr.includes('arrowdown') || styleStr.includes('triangledown') || titleStr.includes('sell') || titleStr.includes('bear');
          const color = named.color ? resolvePineColor(named.color, !isSell) : isSell ? '#ef4444' : '#22c55e';
          const shape = isSell ? 'arrowDown' : 'arrowUp';
          const pos = named.location?.toLowerCase().includes('belowbar') ? 'belowBar' : isSell ? 'aboveBar' : 'belowBar';
          const text = (named.text || named.char || '').replace(/['"]/g, '').trim();

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
        continue;
      }

      // Generic label.new support
      if (stmt.includes('label.new(')) {
        const match = stmt.match(/label\.new\s*\((.*)\)/i);
        if (match) {
          const { positional, named } = parseArguments(match[1]);
          const xVal = evalExpr(named.x || positional[0]);
          const text = (named.text || positional[2] || '').replace(/['"]/g, '').trim();
          const colorStr = named.color || named.textcolor || positional[3];
          const styleStr = (named.style || positional[4] || '').toLowerCase();
          const isDown = styleStr.includes('down') || text.includes('▼') || text.toLowerCase().includes('sell') || text.toLowerCase().includes('bear');
          const shape = isDown ? 'arrowDown' : 'arrowUp';
          const pos = isDown ? 'aboveBar' : 'belowBar';
          const color = resolvePineColor(colorStr, !isDown);

          let targetTime = times[times.length - 1];
          if (typeof xVal === 'number') {
            if (xVal >= 0 && xVal < len) {
              targetTime = times[xVal];
            } else if (xVal > 1000000) {
              targetTime = xVal;
            }
          }

          if (targetTime) {
            markers.push({
              time: targetTime,
              position: pos,
              color,
              shape,
              text,
            });
          }
        }
        continue;
      }

      if (stmt.includes('strategy.entry(') || stmt.includes('strategy.close(') || stmt.includes('strategy.exit(')) {
        const ifMatch = stmt.match(/^(?:if\s*\(?(.*?)\)?\s*(?:then\s*)?)?(strategy\.(?:entry|close|exit)\s*\(.*\))$/i);
        if (ifMatch) {
          const condExpr = ifMatch[1]?.trim();
          const stratCall = ifMatch[2].trim();
          const condSeries = condExpr ? toSeries(evalExpr(condExpr)) : new Array(len).fill(true);

          const stratMatch = stratCall.match(/strategy\.(entry|close|exit)\s*\((.*)\)/i);
          if (stratMatch) {
            const action = stratMatch[1].toLowerCase();
            const { positional, named } = parseArguments(stratMatch[2]);
            const tradeId = named.id?.replace(/['"]/g, '') || positional[0]?.replace(/['"]/g, '') || 'Trade';
            const direction = (named.direction || positional[1] || 'strategy.long').toLowerCase();
            const isLong = direction.includes('long');

            for (let i = 0; i < len; i++) {
              if (!condSeries[i]) continue;
              const candle = candles[i];

              if (action === 'entry') {
                if (openPosition && openPosition.type !== (isLong ? 'long' : 'short')) {
                  const exitPrice = candle.close;
                  const pnl = openPosition.type === 'long'
                    ? (exitPrice - openPosition.entryPrice) * openPosition.qty
                    : (openPosition.entryPrice - exitPrice) * openPosition.qty;
                  const pnlPercent = (pnl / (openPosition.entryPrice * openPosition.qty)) * 100;

                  trades.push({
                    id: trades.length + 1,
                    tradeId: `${openPosition.type.toUpperCase()}-${trades.length + 1}`,
                    type: openPosition.type,
                    entryTime: openPosition.entryTime,
                    entryPrice: openPosition.entryPrice,
                    exitTime: candle.time,
                    exitPrice,
                    quantity: openPosition.qty,
                    pnl,
                    pnlPercent,
                    status: 'closed',
                  });
                  openPosition = null;
                }

                if (!openPosition) {
                  openPosition = {
                    type: isLong ? 'long' : 'short',
                    entryTime: candle.time,
                    entryPrice: candle.close,
                    qty: defaultQty,
                  };
                  markers.push({
                    time: candle.time,
                    position: isLong ? 'belowBar' : 'aboveBar',
                    color: isLong ? '#22c55e' : '#ef4444',
                    shape: isLong ? 'arrowUp' : 'arrowDown',
                    text: isLong ? `BUY (${tradeId})` : `SELL (${tradeId})`,
                  });
                }
              } else if (action === 'close' || action === 'exit') {
                if (openPosition) {
                  const exitPrice = candle.close;
                  const pnl = openPosition.type === 'long'
                    ? (exitPrice - openPosition.entryPrice) * openPosition.qty
                    : (openPosition.entryPrice - exitPrice) * openPosition.qty;
                  const pnlPercent = (pnl / (openPosition.entryPrice * openPosition.qty)) * 100;

                  trades.push({
                    id: trades.length + 1,
                    tradeId: `${openPosition.type.toUpperCase()}-${trades.length + 1}`,
                    type: openPosition.type,
                    entryTime: openPosition.entryTime,
                    entryPrice: openPosition.entryPrice,
                    exitTime: candle.time,
                    exitPrice,
                    quantity: openPosition.qty,
                    pnl,
                    pnlPercent,
                    status: 'closed',
                  });
                  openPosition = null;
                }
              }
            }
          }
        }
        continue;
      }

      const tupleMatch = stmt.match(/^\[(.*)\]\s*=\s*(.*)/);
      if (tupleMatch) {
        const varNames = tupleMatch[1].split(',').map((s) => s.trim().replace(/^(?:var(?:ip)?\s+)?(?:series\s+)?(?:float|int|bool)?\s+/i, ''));
        const expr = tupleMatch[2].trim();

        if (expr.toLowerCase().includes('supertrend')) {
          const match = expr.match(/(?:ta\.)?supertrend\s*\((.*)\)/i);
          if (match) {
            const { positional, named } = parseArguments(match[1]);
            const factor = parseFloat(named.factor || positional[0] || '3') || 3;
            const period = parseInt(named.period || positional[1] || '10', 10) || 10;
            const { supertrend, direction } = calcSupertrend(candles, factor, period);
            if (varNames[0]) env[varNames[0]] = supertrend;
            if (varNames[1]) env[varNames[1]] = direction;
            continue;
          }
        }

        if (expr.toLowerCase().includes('bb')) {
          const match = expr.match(/(?:ta\.)?bb\s*\((.*)\)/i);
          if (match) {
            const { positional, named } = parseArguments(match[1]);
            const src = toSeries(evalExpr(named.series || positional[0] || 'close'));
            const period = parseInt(named.length || positional[1] || '20', 10) || 20;
            const mult = parseFloat(named.mult || positional[2] || '2') || 2;
            const { upper, basis, lower } = calcBollingerBands(src, period, mult);
            if (varNames[0]) env[varNames[0]] = basis;
            if (varNames[1]) env[varNames[1]] = upper;
            if (varNames[2]) env[varNames[2]] = lower;
            continue;
          }
        }

        if (expr.toLowerCase().includes('macd')) {
          const match = expr.match(/(?:ta\.)?macd\s*\((.*)\)/i);
          if (match) {
            const { positional, named } = parseArguments(match[1]);
            const src = toSeries(evalExpr(named.source || positional[0] || 'close'));
            const fast = parseInt(named.fast || positional[1] || '12', 10) || 12;
            const slow = parseInt(named.slow || positional[2] || '26', 10) || 26;
            const sig = parseInt(named.signal || positional[3] || '9', 10) || 9;
            const { macd, signal, hist } = calcMACD(src, fast, slow, sig);
            if (varNames[0]) env[varNames[0]] = macd;
            if (varNames[1]) env[varNames[1]] = signal;
            if (varNames[2]) env[varNames[2]] = hist;
            continue;
          }
        }
      }

      const assignMatch = stmt.match(/^(?:var(?:ip)?\s+)?(?:series\s+)?(?:float|int|bool|color|string)?\s*([a-zA-Z0-9_]+)\s*[:=]+\s*(.*)/i);
      if (assignMatch) {
        const varName = assignMatch[1].trim();
        const expr = assignMatch[2].trim();
        const evaluated = evalExpr(expr);
        if (evaluated !== null && evaluated !== undefined) {
          env[varName] = evaluated;
        }
      }
    }

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
        if (currentEquity > peakEquity) peakEquity = currentEquity;
        const drawdown = peakEquity - currentEquity;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;

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
        grossProfit: totalGains,
        grossLoss: totalLosses,
        avgTradePnl: totalTrades > 0 ? netProfit / totalTrades : 0,
      };

      logs.push(`Backtest simulated ${totalTrades} trades: Win Rate ${winRate.toFixed(1)}%, Net Profit $${netProfit.toFixed(2)}`);
    }

    logs.push(`Execution completed: ${plots.length} plots, ${hlines.length} hlines, ${markers.length} markers.`);

    return {
      success: true,
      scriptName,
      scriptType,
      isOverlay,
      timeframe: timeframeSeconds,
      inputs: extractedInputs,
      plots,
      hlines,
      fills,
      bgcolors,
      markers,
      trades: trades.length > 0 ? trades : undefined,
      strategyStats,
      errors: [],
      logs,
      executionTimeMs: Math.round(performance.now() - startTime),
    };
  } catch (err: any) {
    errors.push({ line: 1, message: err?.message || 'Pine Script runtime execution error.' });
    return { ...defaultResult, errors, executionTimeMs: Math.round(performance.now() - startTime) };
  }
}
