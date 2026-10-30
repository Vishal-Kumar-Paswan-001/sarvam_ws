import crypto from 'crypto';

export const COOKIE = 'ss_session';
const TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET is not set');
  return s;
}

function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

/* Stateless session: the cookie carries an expiry signed with SESSION_SECRET,
 * so no server-side store is needed and it works across Vercel instances. */
export function createSessionCookie() {
  const exp = Date.now() + TTL_MS;
  const payload = `v1.${exp}`;
  const value = `${payload}.${sign(payload)}`;
  return {
    name: COOKIE,
    value,
    options: {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: Math.floor(TTL_MS / 1000),
    },
  };
}

export function clearSessionCookie() {
  return {
    name: COOKIE,
    value: '',
    options: {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    },
  };
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [v, exp, sig] = parts;
  const payload = `${v}.${exp}`;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  if (!crypto.timingSafeEqual(a, b)) return false;
  const expNum = parseInt(exp, 10);
  return Number.isFinite(expNum) && expNum >= Date.now();
}

export function isAuthed(cookieStore) {
  try {
    return verifyToken(cookieStore.get(COOKIE)?.value);
  } catch (_) {
    return false;
  }
}

export function checkPassword(pw) {
  const expected = process.env.APP_PASSWORD || '';
  if (!expected) return false;
  const a = crypto.createHash('sha256').update(String(pw)).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}
