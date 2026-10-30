import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isAuthed } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isAuthed(cookies())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (process.env.TURN_URL) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME || undefined,
      credential: process.env.TURN_CREDENTIAL || undefined,
    });
  }
  return NextResponse.json({ iceServers });
}
