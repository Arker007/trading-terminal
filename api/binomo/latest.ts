import { getBinomoDatetimeForInterval } from '../../src/services/binomoApi';

interface BinomoCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  created_at: string;
}

interface CachedEntry {
  candle: any;
  timestamp: number;
}

const memoryCache = new Map<number, CachedEntry>();

export default async function handler(req: any, res?: any) {
  const isNode = res && typeof res.status === 'function';

  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    if (isNode) {
      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(200).end();
    }
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    let interval = '60';
    let asset = 'Z-CRY/IDX';

    if (req.query) {
      interval = (req.query.interval as string) || interval;
      asset = (req.query.asset as string) || asset;
    } else if (req.url) {
      const parsedUrl = new URL(req.url, 'http://localhost');
      interval = parsedUrl.searchParams.get('interval') || interval;
      asset = parsedUrl.searchParams.get('asset') || asset;
    }

    const intervalNum = parseInt(interval, 10) || 60;
    const now = Date.now();

    // Check fast memory cache (under 400ms old)
    const cached = memoryCache.get(intervalNum);
    if (cached && now - cached.timestamp < 400) {
      const responsePayload = {
        success: true,
        interval: intervalNum,
        candle: cached.candle,
        serverTimestamp: now,
        isCached: true,
      };
      if (isNode) {
        Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
        return res.status(200).json(responsePayload);
      }
      return new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: corsHeaders,
      });
    }

    const targetDate = getBinomoDatetimeForInterval(intervalNum);
    const encodedAsset = encodeURIComponent(asset);
    const url = `https://api.binomo.com/candles/v1/${encodedAsset}/${targetDate}/${intervalNum}?locale=en`;

    const upstreamResponse = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
        'Accept': 'application/json, text/plain, */*',
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!upstreamResponse.ok) {
      if (cached) {
        const responsePayload = {
          success: true,
          interval: intervalNum,
          candle: cached.candle,
          serverTimestamp: now,
          warning: 'Upstream error, served cached tick',
        };
        if (isNode) {
          Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
          return res.status(200).json(responsePayload);
        }
        return new Response(JSON.stringify(responsePayload), { status: 200, headers: corsHeaders });
      }
      const errText = await upstreamResponse.text();
      const errPayload = {
        success: false,
        error: `Binomo API returned status ${upstreamResponse.status}`,
        details: errText,
      };
      if (isNode) {
        Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
        return res.status(upstreamResponse.status).json(errPayload);
      }
      return new Response(JSON.stringify(errPayload), { status: upstreamResponse.status, headers: corsHeaders });
    }

    const json: any = await upstreamResponse.json();
    if (!json.success || !Array.isArray(json.data) || json.data.length === 0) {
      const emptyPayload = {
        success: false,
        error: 'No candle data available',
      };
      if (isNode) {
        Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
        return res.status(404).json(emptyPayload);
      }
      return new Response(JSON.stringify(emptyPayload), { status: 404, headers: corsHeaders });
    }

    const rawLatest: BinomoCandle = json.data[json.data.length - 1];
    const timeInSec = Math.floor(new Date(rawLatest.created_at).getTime() / 1000);
    const alignedTime = Math.floor(timeInSec / intervalNum) * intervalNum;
    const open = Number(rawLatest.open);
    const high = Number(rawLatest.high);
    const low = Number(rawLatest.low);
    const close = Number(rawLatest.close);
    const volume = Math.max(1, Math.round(Math.abs(high - low) * 1e8 + Math.abs(close - open) * 1e8));

    const formattedCandle = {
      time: alignedTime,
      open,
      high,
      low,
      close,
      volume,
      created_at: rawLatest.created_at,
      serverTimestamp: now,
    };

    memoryCache.set(intervalNum, {
      candle: formattedCandle,
      timestamp: now,
    });

    const responsePayload = {
      success: true,
      interval: intervalNum,
      candle: formattedCandle,
      serverTimestamp: now,
    };

    if (isNode) {
      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(200).json(responsePayload);
    }
    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const errPayload = {
      success: false,
      error: 'Failed to fetch latest candle',
      details: errorMsg,
    };
    if (isNode) {
      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(500).json(errPayload);
    }
    return new Response(JSON.stringify(errPayload), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

export async function GET(req: any) {
  return handler(req);
}
