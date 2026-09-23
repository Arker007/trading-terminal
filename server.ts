import express, { Response } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

interface BinomoCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  created_at: string;
}

interface TickPayload {
  time: number; // UTC seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  created_at: string;
  isNewCandle: boolean;
  tickIndex: number;
  serverTimestamp: number;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Permissive CORS middleware for dev and external previews
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  // Real-time state
  let latestCandle: TickPayload | null = null;
  const latestCandles = new Map<number, TickPayload>();
  const historyCache = new Map<number, any>();
  let tickCounter = 0;
  const sseClients = new Map<Response, number>();

  // Helper to format a raw Binomo candle for a specific timeframe interval
  function formatCandleForInterval(raw: BinomoCandle, interval: number): TickPayload {
    const timeInSec = Math.floor(new Date(raw.created_at).getTime() / 1000);
    const alignedTime = Math.floor(timeInSec / interval) * interval;
    const open = Number(raw.open);
    const high = Number(raw.high);
    const low = Number(raw.low);
    const close = Number(raw.close);
    const volume = Math.max(1, Math.round((Math.abs(high - low) * 1e8) + Math.abs(close - open) * 1e8));

    const prev = latestCandles.get(interval);
    const isNew = !prev || alignedTime > prev.time;
    tickCounter++;

    return {
      time: alignedTime,
      open,
      high,
      low,
      close,
      volume,
      created_at: raw.created_at,
      isNewCandle: isNew,
      tickIndex: tickCounter,
      serverTimestamp: Date.now(),
    };
  }

function getBinomoDatetimeForInterval(interval: number, now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
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
  } else if (interval <= 60) {
    // 60s (1m): daily midnight chunk
    return `${y}-${m}-${d}T00:00:00`;
  } else if (interval <= 300) {
    // 300s (5m): multi-day Sunday chunk
    const daysBack = now.getUTCDay();
    const sunday = new Date(now.getTime() - daysBack * 86400000);
    const sy = sunday.getUTCFullYear();
    const sm = pad(sunday.getUTCMonth() + 1);
    const sd = pad(sunday.getUTCDate());
    return `${sy}-${sm}-${sd}T00:00:00`;
  } else {
    // 15m, 1h: monthly chunk
    return `${y}-${m}-01T00:00:00`;
  }
}

  // Poller for a specific interval
  async function pollBinomoInterval(interval: number) {
    try {
      const defaultDate = getBinomoDatetimeForInterval(interval);
      const url = `https://api.binomo.com/candles/v1/Z-CRY%2FIDX/${defaultDate}/${interval}?locale=en`;
      const resp = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)",
          "Accept": "application/json",
        },
      });

      if (!resp.ok) return;

      const json = await resp.json();
      if (!json.success || !Array.isArray(json.data) || json.data.length === 0) return;

      const rawLatest: BinomoCandle = json.data[json.data.length - 1];
      const newTick = formatCandleForInterval(rawLatest, interval);

      const prev = latestCandles.get(interval);
      const priceChanged =
        !prev ||
        prev.close !== newTick.close ||
        prev.high !== newTick.high ||
        prev.low !== newTick.low ||
        prev.time !== newTick.time;

      latestCandles.set(interval, newTick);
      if (interval === 60) {
        latestCandle = newTick;
      }

      if (priceChanged && sseClients.size > 0) {
        const message = `event: tick\ndata: ${JSON.stringify(newTick)}\n\n`;
        for (const [client, clientInterval] of sseClients.entries()) {
          if (clientInterval === interval) {
            try {
              if (client.destroyed || client.writableEnded) {
                sseClients.delete(client);
              } else {
                client.write(message);
                if (typeof (client as any).flush === "function") {
                  (client as any).flush();
                }
              }
            } catch {
              sseClients.delete(client);
            }
          }
        }
      }
    } catch {
      // transient network error
    }
  }

  // Poll all currently active intervals (including 5s and 60s by default)
  async function pollAllActiveIntervals() {
    const intervalsToPoll = new Set<number>([5, 60]);
    for (const iv of sseClients.values()) {
      intervalsToPoll.add(iv);
    }
    await Promise.all(Array.from(intervalsToPoll).map((iv) => pollBinomoInterval(iv)));
  }

  // Continuous background poller running every 500ms
  const pollerInterval = setInterval(pollAllActiveIntervals, 500);
  pollAllActiveIntervals();

  // 1. API Route: Full Candles History Proxy
  app.get("/api/binomo/candles", async (req, res) => {
    try {
      const asset = (req.query.asset as string) || "Z-CRY/IDX";
      const interval = (req.query.interval as string) || "60";
      const intervalNum = parseInt(interval, 10) || 60;
      const defaultDate = getBinomoDatetimeForInterval(intervalNum);
      const date = (req.query.date as string) || defaultDate;
      const locale = (req.query.locale as string) || "en";

      let targetUrl = req.query.url as string;
      if (!targetUrl) {
        const encodedAsset = encodeURIComponent(asset);
        targetUrl = `https://api.binomo.com/candles/v1/${encodedAsset}/${date}/${interval}?locale=${locale}`;
      }

      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)",
          "Accept": "application/json, text/plain, */*",
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        const cached = historyCache.get(intervalNum);
        if (cached) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          return res.json({
            ...cached,
            _meta: {
              ...cached._meta,
              isFromCache: true,
              warning: `Live upstream API returned ${response.status}; served from cache`,
            },
          });
        }
        const errorText = await response.text();
        return res.status(response.status).json({
          success: false,
          error: `Binomo API returned status ${response.status}`,
          details: errorText,
          targetUrl,
        });
      }

      const data = await response.json();

      // For 5s timeframe, if current hour has < 150 candles, stitch previous hour for deep history
      if (intervalNum === 5 && !req.query.url && Array.isArray(data?.data) && data.data.length < 150) {
        try {
          const now = new Date();
          const prevHourDate = new Date(now.getTime() - 3600000);
          const prevDateStr = getBinomoDatetimeForInterval(5, prevHourDate);
          const encodedAsset = encodeURIComponent(asset);
          const prevUrl = `https://api.binomo.com/candles/v1/${encodedAsset}/${prevDateStr}/5?locale=${locale}`;
          const prevResp = await fetch(prevUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)",
              "Accept": "application/json, text/plain, */*",
            },
            signal: AbortSignal.timeout(4000),
          });
          if (prevResp.ok) {
            const prevData = await prevResp.json();
            if (Array.isArray(prevData?.data)) {
              data.data = [...prevData.data, ...data.data];
            }
          }
        } catch {
          // ignore error, keep single chunk
        }
      }

      if (data && data.success && Array.isArray(data.data)) {
        historyCache.set(intervalNum, data);
      }

      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      return res.json({
        ...data,
        _meta: {
          targetUrl,
          fetchedAt: new Date().toISOString(),
          candleCount: data?.data?.length || 0,
        },
      });
    } catch (err: unknown) {
      const intervalNum = parseInt((req.query.interval as string) || "60", 10) || 60;
      const cached = historyCache.get(intervalNum);
      if (cached) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        return res.json({
          ...cached,
          _meta: {
            ...cached._meta,
            isFromCache: true,
            warning: "Served from server memory cache after network timeout",
          },
        });
      }
      const errorMsg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch from Binomo API",
        details: errorMsg,
      });
    }
  });

  // 2. API Route: Latest single candle
  app.get("/api/binomo/latest", (req, res) => {
    const requestedInterval = parseInt(req.query.interval as string) || 60;
    const candle = latestCandles.get(requestedInterval) || (requestedInterval === 60 ? latestCandle : null) || latestCandles.get(5) || latestCandle;
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    return res.json({
      success: true,
      interval: requestedInterval,
      candle,
      tickCount: tickCounter,
      activeClients: sseClients.size,
    });
  });

  // 3. API Route: Real-Time SSE Stream (`/api/binomo/stream`)
  app.get("/api/binomo/stream", (req, res) => {
    const requestedInterval = parseInt(req.query.interval as string) || 60;

    // Prevent proxy and server socket timeouts for persistent SSE connection
    req.socket.setTimeout(0);
    req.socket.setNoDelay(true);
    req.socket.setKeepAlive(true, 5000);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "X-Accel-Buffering": "no",
    });

    if (typeof (res as any).flushHeaders === "function") {
      (res as any).flushHeaders();
    }

    res.write(`event: connected\ndata: ${JSON.stringify({ status: "connected", interval: requestedInterval, timestamp: Date.now() })}\n\n`);
    if (typeof (res as any).flush === "function") (res as any).flush();

    // Send latest candle snapshot immediately if available
    const snapshot = latestCandles.get(requestedInterval) || (requestedInterval === 60 ? latestCandle : null);
    if (snapshot) {
      res.write(`event: tick\ndata: ${JSON.stringify(snapshot)}\n\n`);
      if (typeof (res as any).flush === "function") (res as any).flush();
    }

    sseClients.set(res, requestedInterval);

    // Immediately trigger a poll for this interval to send instant fresh data
    pollBinomoInterval(requestedInterval);

    // Heartbeat ping every 5s to maintain active connection through reverse proxies
    const pingTimer = setInterval(() => {
      try {
        if (res.destroyed || res.writableEnded) {
          clearInterval(pingTimer);
          sseClients.delete(res);
          return;
        }
        res.write(`:ping\n\n`);
        if (typeof (res as any).flush === "function") (res as any).flush();
      } catch {
        clearInterval(pingTimer);
        sseClients.delete(res);
      }
    }, 5000);

    const cleanupClient = () => {
      clearInterval(pingTimer);
      sseClients.delete(res);
    };

    req.on("close", cleanupClient);
    res.on("close", cleanupClient);
    res.on("error", cleanupClient);
    res.on("finish", cleanupClient);
  });

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      liveClients: sseClients.size,
      latestTick: latestCandle?.created_at,
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
