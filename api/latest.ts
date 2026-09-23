import handler from './binomo/latest';

export default handler;

export async function GET(req: any) {
  return handler(req);
}
