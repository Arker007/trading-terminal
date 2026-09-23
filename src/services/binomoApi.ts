import { BinomoApiResponse, FormattedCandle } from '../types';

export const DEFAULT_ASSET = 'Z-CRY/IDX';
export const DEFAULT_INTERVAL = 60; // 60 seconds (1 minute)

/**
 * Calculates the dynamic Binomo API chunk datetime for any timeframe interval.
 * - 5s: hourly chunk, e.g. 2026-09-22T14:00:00
 * - 15s: 4-hour chunk, e.g. 2026-09-22T12:00:00
 * - 30s: 12-hour chunk, e.g. 2026-09-22T12:00:00
 * - 60s (1m): daily midnight chunk, e.g. 2026-09-22T00:00:00
 * - 300s (5m): multi-day Sunday chunk, e.g. 2026-09-20T00:00:00
 * - 900s / 3600s: monthly chunk, e.g. 2026-09-01T00:00:00
 */
export function getBinomoDatetimeForInterval(interval: number, now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = now.getUTCFullYear();
  const m = pad(now.getUTCMonth() + 1);
  const d = pad(now.getUTCDate());
  const h = now.getUTCHours();

  if (interval <= 5) {
    // 5s: hourly chunk (e.g. 2026-09-22T14:00:00)
    return `${y}-${m}-${d}T${pad(h)}:00:00`;
  } else if (interval <= 15) {
    // 15s: 4-hour chunk (00, 04, 08, 12, 16, 20)
    const chunkH = Math.floor(h / 4) * 4;
    return `${y}-${m}-${d}T${pad(chunkH)}:00:00`;
  } else if (interval <= 30) {
    // 30s: 12-hour chunk (00, 12)
    const chunkH = Math.floor(h / 12) * 12;
    return `${y}-${m}-${d}T${pad(chunkH)}:00:00`;
  } else {
    // 60s (1m), 300s (5m), 900s (15m), 3600s (1h): daily midnight chunk
    return `${y}-${m}-${d}T00:00:00`;
  }
}

/**
 * Calculates the previous historical chunk datetime for unlimited scroll-back pagination.
 */
export function getPreviousChunkDate(interval: number, oldestSec: number): string {
  let stepSec = 86400;
  if (interval <= 5) stepSec = 3600;
  else if (interval <= 15) stepSec = 3600 * 4;
  else if (interval <= 30) stepSec = 3600 * 12;
  else stepSec = 86400;

  const targetDate = new Date((oldestSec - stepSec) * 1000);
  return getBinomoDatetimeForInterval(interval, targetDate);
}

/**
 * Builds the canonical Binomo candles API URL for any asset, timeframe interval, and datetime
 */
export function buildBinomoUrl(
  asset: string = DEFAULT_ASSET,
  interval: number = DEFAULT_INTERVAL,
  customDate?: string
): string {
  const date = customDate || getBinomoDatetimeForInterval(interval);
  const encodedAsset = encodeURIComponent(asset);
  return `https://api.binomo.com/candles/v1/${encodedAsset}/${date}/${interval}?locale=en`;
}

export const DEFAULT_DATE = getBinomoDatetimeForInterval(DEFAULT_INTERVAL);
export const DEFAULT_BINOMO_URL = buildBinomoUrl(DEFAULT_ASSET, DEFAULT_INTERVAL);

export interface FetchCandlesParams {
  asset?: string;
  date?: string;
  interval?: number;
  customUrl?: string;
}

/**
 * Generates smooth synthetic market fallback candles if upstream network is completely unreachable
 */
export function generateFallbackCandles(
  interval: number = DEFAULT_INTERVAL,
  count: number = 300,
  basePrice: number = 641.867420
): FormattedCandle[] {
  const candles: FormattedCandle[] = [];
  const nowInSec = Math.floor(Date.now() / 1000);
  const alignedNow = Math.floor(nowInSec / interval) * interval;
  let currentPrice = basePrice;

  // Realistic natural tick scale for Crypto IDX (1e-7 range)
  const stepScale = 0.00000015;

  for (let i = count - 1; i >= 0; i--) {
    const time = alignedNow - i * interval;
    const delta = (Math.random() - 0.495) * stepScale;
    const open = currentPrice;
    currentPrice = Number((currentPrice + delta).toFixed(8));
    const close = currentPrice;
    const spread = Math.abs(delta) * (1 + Math.random()) + 0.0000001;
    const high = Number((Math.max(open, close) + Math.random() * spread).toFixed(8));
    const low = Number((Math.min(open, close) - Math.random() * spread).toFixed(8));
    const volume = Math.max(1, Math.round(Math.abs(high - low) * 1e8 + Math.abs(close - open) * 1e8));

    candles.push({
      time,
      open,
      high,
      low,
      close,
      volume,
    });
  }
  return candles;
}

export async function fetchBinomoCandles(params?: FetchCandlesParams): Promise<{
  candles: FormattedCandle[];
  rawResponse: BinomoApiResponse;
  targetUrl: string;
}> {
  const asset = params?.asset || DEFAULT_ASSET;
  const interval = params?.interval ?? DEFAULT_INTERVAL;
  const date = params?.date || getBinomoDatetimeForInterval(interval);
  const customUrl = params?.customUrl;

  let queryUrl = '/api/binomo/candles';
  if (customUrl) {
    queryUrl += `?url=${encodeURIComponent(customUrl)}`;
  } else {
    queryUrl += `?asset=${encodeURIComponent(asset)}&date=${encodeURIComponent(date)}&interval=${interval}`;
  }

  let rawData: BinomoApiResponse | null = null;
  const canonicalUrl = buildBinomoUrl(asset, interval, date);

  try {
    const res = await fetch(queryUrl);
    if (res.ok) {
      rawData = await res.json();
    } else {
      // If nested route returned 404, try root alias route /api/candles
      if (res.status === 404) {
        try {
          const flatUrl = queryUrl.replace('/api/binomo/candles', '/api/candles');
          const flatRes = await fetch(flatUrl);
          if (flatRes.ok) {
            rawData = await flatRes.json();
          }
        } catch {}
      }

      // If backend proxy route returned 404 or non-200, try direct upstream fetch as resilient fallback
      if (!rawData) {
        try {
          const directRes = await fetch(canonicalUrl, {
            headers: {
              'Accept': 'application/json, text/plain, */*',
            },
            signal: AbortSignal.timeout(5000),
          });
          if (directRes.ok) {
            rawData = await directRes.json();
          }
        } catch {
          // Direct browser CORS restriction or network failure
        }
      }

      if (!rawData) {
        try {
          const errorJson = await res.json();
          if (errorJson?.data && Array.isArray(errorJson.data)) {
            rawData = errorJson;
          }
        } catch {
          // ignore parse error
        }
      }
    }
  } catch (proxyError) {
    // If local proxy call failed, try direct fetch
    try {
      const directRes = await fetch(canonicalUrl, {
        headers: {
          'Accept': 'application/json, text/plain, */*',
        },
        signal: AbortSignal.timeout(5000),
      });
      if (directRes.ok) {
        rawData = await directRes.json();
      }
    } catch {
      // ignore
    }
  }

  // If proxy fetch succeeded and has valid data array
  if (rawData && rawData.success && Array.isArray(rawData.data) && rawData.data.length > 0) {
    const seenTimes = new Set<number>();
    const formatted: FormattedCandle[] = [];

    const parsed = rawData.data
      .map((item) => {
        const timeInSec = Math.floor(new Date(item.created_at).getTime() / 1000);
        const alignedTime = Math.floor(timeInSec / interval) * interval;
        const open = Number(item.open);
        const high = Number(item.high);
        const low = Number(item.low);
        const close = Number(item.close);
        const volume = Math.max(1, Math.round(Math.abs(high - low) * 1e8 + Math.abs(close - open) * 1e8));
        return {
          time: alignedTime,
          open,
          high,
          low,
          close,
          volume,
        };
      })
      .filter((c) => !isNaN(c.time) && !isNaN(c.open) && !isNaN(c.high) && !isNaN(c.low) && !isNaN(c.close));

    parsed.sort((a, b) => a.time - b.time);

    for (const candle of parsed) {
      if (!seenTimes.has(candle.time)) {
        seenTimes.add(candle.time);
        formatted.push(candle);
      }
    }

    if (formatted.length > 0) {
      return {
        candles: formatted,
        rawResponse: rawData,
        targetUrl: rawData._meta?.targetUrl || customUrl || canonicalUrl,
      };
    }
  }

  // Graceful fallback to synthetic data if network or exchange API is offline
  console.info('Generating fallback candle dataset for continuous display...');
  const fallbackCandles = generateFallbackCandles(interval, 300);
  const fallbackRaw: BinomoApiResponse = {
    data: fallbackCandles.map((c) => ({
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      created_at: new Date(c.time * 1000).toISOString(),
    })),
    errors: [],
    success: true,
    _meta: {
      targetUrl: customUrl || canonicalUrl,
      fetchedAt: new Date().toISOString(),
      candleCount: fallbackCandles.length,
      isFallback: true,
    },
  };

  return {
    candles: fallbackCandles,
    rawResponse: fallbackRaw,
    targetUrl: customUrl || canonicalUrl,
  };
}
