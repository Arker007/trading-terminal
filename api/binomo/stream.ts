export default async function handler(req: any, res?: any) {
  const isNode = res && typeof res.status === 'function';

  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  };

  if (req.method === 'OPTIONS') {
    if (isNode) {
      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(200).end();
    }
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  let interval = '60';
  if (req.query) {
    interval = (req.query.interval as string) || interval;
  } else if (req.url) {
    const parsedUrl = new URL(req.url, 'http://localhost');
    interval = parsedUrl.searchParams.get('interval') || interval;
  }
  const intervalNum = parseInt(interval, 10) || 60;

  if (isNode) {
    // SSE Stream for Node runtime
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no',
    });

    res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', interval: intervalNum, timestamp: Date.now() })}\n\n`);
    if (typeof (res as any).flush === 'function') (res as any).flush();

    // Heartbeat ping
    const pingTimer = setInterval(() => {
      try {
        if (res.destroyed || res.writableEnded) {
          clearInterval(pingTimer);
          return;
        }
        res.write(`:ping\n\n`);
        if (typeof (res as any).flush === 'function') (res as any).flush();
      } catch {
        clearInterval(pingTimer);
      }
    }, 5000);

    const cleanup = () => {
      clearInterval(pingTimer);
    };

    req.on('close', cleanup);
    res.on('close', cleanup);
    res.on('finish', cleanup);
    return;
  }

  // Fallback for edge / response stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ status: 'connected', interval: intervalNum, timestamp: Date.now() })}\n\n`));
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function GET(req: any) {
  return handler(req);
}
