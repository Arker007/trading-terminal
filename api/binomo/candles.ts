interface BinomoCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  created_at: string;
}

function getBinomoDatetimeForInterval(interval: number, now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = now.getUTCFullYear();
  const m = pad(now.getUTCMonth() + 1);
  const d = pad(now.getUTCDate());
  const h = now.getUTCHours();

  if (interval <= 5) {
    return `${y}-${m}-${d}T${pad(h)}:00:00`;
  } else if (interval <= 15) {
    const chunkH = Math.floor(h / 4) * 4;
    return `${y}-${m}-${d}T${pad(chunkH)}:00:00`;
  } else if (interval <= 30) {
    const chunkH = Math.floor(h / 12) * 12;
    return `${y}-${m}-${d}T${pad(chunkH)}:00:00`;
  } else if (interval <= 60) {
    return `${y}-${m}-${d}T00:00:00`;
  } else if (interval <= 300) {
    const daysBack = now.getUTCDay();
    const sunday = new Date(now.getTime() - daysBack * 86400000);
    const sy = sunday.getUTCFullYear();
    const sm = pad(sunday.getUTCMonth() + 1);
    const sd = pad(sunday.getUTCDate());
    return `${sy}-${sm}-${sd}T00:00:00`;
  } else {
    return `${y}-${m}-01T00:00:00`;
  }
}

export default async function handler(req: any, res?: any) {
  const isNode = res && typeof res.status === 'function';

  // Set permissive CORS headers for Vercel deployment
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

    if (intervalNum > 60 && !customUrl) {
      const encodedAsset = encodeURIComponent(asset);
      const reqDate = new Date(targetDate.endsWith('Z') ? targetDate : targetDate + 'Z');
      const daysToFetch = intervalNum >= 3600 ? 5 : intervalNum >= 900 ? 3 : 2;
      const all60sCandles: BinomoCandle[] = [];

      const pad = (n: number) => String(n).padStart(2, '0');
      for (let i = daysToFetch - 1; i >= 0; i--) {
        const d = new Date(reqDate.getTime() - i * 86400000);
        const dateStr = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T00:00:00`;
        const dayUrl = `https://api.binomo.com/candles/v1/${encodedAsset}/${dateStr}/60?locale=${locale}`;
        try {
          const dayResp = await fetch(dayUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
              'Accept': 'application/json, text/plain, */*',
            },
            signal: AbortSignal.timeout(6000),
          });
          if (dayResp.ok) {
            const dayJson = await dayResp.json();
            if (Array.isArray(dayJson?.data)) {
              all60sCandles.push(...dayJson.data);
            }
          }
        } catch {}
      }

      const seen = new Set<string>();
      const unique60s: BinomoCandle[] = [];
      for (const c of all60sCandles) {
        if (!seen.has(c.created_at)) {
          seen.add(c.created_at);
          unique60s.push(c);
        }
      }
      unique60s.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      // Aggregate into target interval
      const candleMap = new Map<number, BinomoCandle>();
      for (const c of unique60s) {
        const timeInSec = Math.floor(new Date(c.created_at).getTime() / 1000);
        const bucket = Math.floor(timeInSec / intervalNum) * intervalNum;
        const existing = candleMap.get(bucket);
        if (!existing) {
          candleMap.set(bucket, {
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
            created_at: new Date(bucket * 1000).toISOString(),
          });
        } else {
          existing.high = Math.max(existing.high, Number(c.high));
          existing.low = Math.min(existing.low, Number(c.low));
          existing.close = Number(c.close);
        }
      }
      const aggregated = Array.from(candleMap.values()).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      const resultData = {
        data: aggregated,
        errors: [],
        success: true,
        _meta: {
          targetUrl: `https://api.binomo.com/candles/v1/${encodedAsset}/${targetDate}/${intervalNum}?locale=${locale}`,
          fetchedAt: new Date().toISOString(),
          candleCount: aggregated.length,
          isSynthesized: true,
          sourceInterval: 60,
        },
      };

      if (isNode) {
        Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
        return res.status(200).json(resultData);
      }
      return new Response(JSON.stringify(resultData), {
        status: 200,
        headers: corsHeaders,
      });
    }

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
