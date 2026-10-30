import { NextResponse } from 'next/server';
import { checkPassword, createSessionCookie } from '@/lib/auth';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  // Rate limit: 10 attempts per 10 minutes per IP (shared store).
  try {
    const n = await getStore().incr('rl:login:' + ip, 600);
    if (n > 10) {
      return NextResponse.json(
        { error: 'too many attempts, try again later' },
        { status: 429 }
      );
    }
  } catch (_) {
    /* if the limiter fails, do not block legitimate logins */
  }

  let body = {};
  try {
    body = await req.json();
  } catch (_) {
    body = {};
  }
  const pw = body && typeof body.password === 'string' ? body.password : '';
  if (!checkPassword(pw)) {
    return NextResponse.json({ error: 'invalid credentials' }, { status: 401 });
  }

  const c = createSessionCookie();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(c.name, c.value, c.options);
  return res;
}
