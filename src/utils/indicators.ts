import { FormattedCandle } from '../types';

export interface IndicatorPoint {
  time: number;
  value: number;
}

/**
 * Computes Simple Moving Average (SMA)
 */
export function calculateSMA(candles: FormattedCandle[], period: number = 20): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  if (candles.length < period) return result;

  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) {
      sum -= candles[i - period].close;
    }
    if (i >= period - 1) {
      result.push({
        time: candles[i].time,
        value: sum / period,
      });
    }
  }
  return result;
}

/**
 * Computes Exponential Moving Average (EMA)
 */
export function calculateEMA(candles: FormattedCandle[], period: number = 50): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  if (candles.length < period) return result;

  const k = 2 / (period + 1);
  let ema = candles.slice(0, period).reduce((acc, c) => acc + c.close, 0) / period;

  result.push({
    time: candles[period - 1].time,
    value: ema,
  });

  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
    result.push({
      time: candles[i].time,
      value: ema,
    });
  }

  return result;
}

/**
 * Computes Bollinger Bands (Middle, Upper, Lower)
 */
export function calculateBollingerBands(
  candles: FormattedCandle[],
  period: number = 20,
  stdDevMultiplier: number = 2
) {
  const upper: IndicatorPoint[] = [];
  const middle: IndicatorPoint[] = [];
  const lower: IndicatorPoint[] = [];

  if (candles.length < period) {
    return { upper, middle, lower };
  }

  for (let i = period - 1; i < candles.length; i++) {
    const window = candles.slice(i - period + 1, i + 1);
    const mean = window.reduce((acc, c) => acc + c.close, 0) / period;
    const variance = window.reduce((acc, c) => acc + Math.pow(c.close - mean, 2), 0) / period;
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
