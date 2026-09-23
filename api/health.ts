export default function handler(req: any, res?: any) {
  const isNode = res && typeof res.status === 'function';
  const data = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: 'vercel-serverless',
  };

  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (isNode) {
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).json(data);
  }
  return new Response(JSON.stringify(data), { status: 200, headers });
}

export function GET(req: any) {
  return handler(req);
}
