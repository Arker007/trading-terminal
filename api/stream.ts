import handler from './binomo/stream';

export default handler;

export async function GET(req: any) {
  return handler(req);
}
