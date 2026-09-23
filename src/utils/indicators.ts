import { FormattedCandle } from '../types';

export interface IndicatorPoint {
  time: number;
  value: number;
}

/**
 * Computes Simple Moving Average (SMA) with adaptive warm-up for small datasets
 */
export function calculateSMA(candles: FormattedCandle[], period: number = 20): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  if (!candles || candles.length === 0) return result;

  const effectivePeriod = Math.max(1, Math.min(period, candles.length));
  
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= effectivePeriod) {
      sum -= candles[i - effectivePeriod].close;
      result.push({
        time: candles[i].time,
        value: sum / effectivePeriod,
      });
    } else {
      // Warm-up average for initial bars so lines don't completely vanish on higher timeframes
      result.push({
        time: candles[i].time,
        value: sum / (i + 1),
      });
    }
  }
  return result;
}

/**
 * Computes Exponential Moving Average (EMA) with adaptive warm-up for small datasets
 */
export function calculateEMA(candles: FormattedCandle[], period: number = 50): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  if (!candles || candles.length === 0) return result;

  const effectivePeriod = Math.max(2, Math.min(period, candles.length));
  const k = 2 / (effectivePeriod + 1);

  let ema = candles[0].close;
  result.push({
    time: candles[0].time,
    value: ema,
  });

  for (let i = 1; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
    result.push({
      time: candles[i].time,
      value: ema,
    });
  }

  return result;
}

/**
 * Computes Bollinger Bands (Middle, Upper, Lower) with adaptive calculation for small datasets
 */
export function calculateBollingerBands(
  candles: FormattedCandle[],
  period: number = 20,
  stdDevMultiplier: number = 2
) {
  const upper: IndicatorPoint[] = [];
  const middle: IndicatorPoint[] = [];
  const lower: IndicatorPoint[] = [];

  if (!candles || candles.length === 0) {
    return { upper, middle, lower };
  }

  const effectivePeriod = Math.max(2, Math.min(period, candles.length));

  for (let i = 0; i < candles.length; i++) {
    const windowStart = Math.max(0, i - effectivePeriod + 1);
    const window = candles.slice(windowStart, i + 1);
    const windowLen = window.length;

    const mean = window.reduce((acc, c) => acc + c.close, 0) / windowLen;
    const variance = window.reduce((acc, c) => acc + Math.pow(c.close - mean, 2), 0) / windowLen;
    const stdDev = Math.sqrt(variance);

    const time = candles[i].time;
    middle.push({ time, value: mean });
    upper.push({ time, value: mean + stdDevMultiplier * stdDev });
    lower.push({ time, value: mean - stdDevMultiplier * stdDev });
  }

  return { upper, middle, lower };
}

/**
 * Format price with 8-decimal precision suitable for Binomo Crypto IDX
 */
export function formatPrice(price: number, decimals: number = 8): string {
  if (typeof price !== 'number' || isNaN(price)) return '0.00000000';
  return price.toFixed(decimals);
}
