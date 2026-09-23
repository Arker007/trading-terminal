import type { IncomingMessage, ServerResponse } from 'http';
import { getBinomoDatetimeForInterval } from '../../src/services/binomoApi';

interface BinomoCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  created_at: string;
}

export default async function handler(req: any, res?: any) {
  const isNode = res && typeof res.status === 'function';

  // Set CORS headers
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
    let asset = 'Z-CRY/IDX';
    let interval = '60';
    let date = '';
    let locale = 'en';
    let customUrl = '';

    if (req.query) {
      asset = (req.query.asset as string) || asset;
      interval = (req.query.interval as string) || interval;
      date = (req.query.date as string) || '';
      locale = (req.query.locale as string) || locale;
      customUrl = (req.query.url as string) || '';
    } else if (req.url) {
      const parsedUrl = new URL(req.url, 'http://localhost');
      asset = parsedUrl.searchParams.get('asset') || asset;
      interval = parsedUrl.searchParams.get('interval') || interval;
      date = parsedUrl.searchParams.get('date') || '';
      locale = parsedUrl.searchParams.get('locale') || locale;
      customUrl = parsedUrl.searchParams.get('url') || '';
    }

    const intervalNum = parseInt(interval, 10) || 60;
    const defaultDate = getBinomoDatetimeForInterval(intervalNum);
    const targetDate = date || defaultDate;

    let targetUrl = customUrl;
    if (!targetUrl) {
      const encodedAsset = encodeURIComponent(asset);
      targetUrl = `https://api.binomo.com/candles/v1/${encodedAsset}/${targetDate}/${interval}?locale=${locale}`;
    }

    const upstreamResponse = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
        'Accept': 'application/json, text/plain, */*',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!upstreamResponse.ok) {
      const errorText = await upstreamResponse.text();
      const errPayload = {
        success: false,
        error: `Binomo API returned status ${upstreamResponse.status}`,
        details: errorText,
        targetUrl,
      };
      if (isNode) {
        Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
        return res.status(upstreamResponse.status).json(errPayload);
      }
      return new Response(JSON.stringify(errPayload), {
        status: upstreamResponse.status,
        headers: corsHeaders,
      });
    }

    const data: any = await upstreamResponse.json();

    // For 5s timeframe, if current hour has < 150 candles, stitch previous hour
    if (intervalNum === 5 && !customUrl && Array.isArray(data?.data) && data.data.length < 150) {
      try {
        const now = new Date();
        const prevHourDate = new Date(now.getTime() - 3600000);
        const prevDateStr = getBinomoDatetimeForInterval(5, prevHourDate);
        const encodedAsset = encodeURIComponent(asset);
        const prevUrl = `https://api.binomo.com/candles/v1/${encodedAsset}/${prevDateStr}/5?locale=${locale}`;
        const prevResp = await fetch(prevUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
            'Accept': 'application/json, text/plain, */*',
          },
          signal: AbortSignal.timeout(4000),
        });
        if (prevResp.ok) {
          const prevData: any = await prevResp.json();
          if (Array.isArray(prevData?.data)) {
            data.data = [...prevData.data, ...data.data];
          }
        }
      } catch {
        // ignore error
      }
    }

    const responsePayload = {
      ...data,
      _meta: {
        targetUrl,
        fetchedAt: new Date().toISOString(),
        candleCount: data?.data?.length || 0,
      },
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
      error: 'Failed to fetch candles from Binomo upstream',
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
