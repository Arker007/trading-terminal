import handler from './binomo/candles';

export default handler;

export async function GET(req: any) {
  return handler(req);
}
