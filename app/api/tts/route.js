import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isAuthed } from '@/lib/auth';
import { sarvamTTS } from '@/lib/sarvam';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req) {
  if (!isAuthed(cookies())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!process.env.SARVAM_API_KEY) {
    return NextResponse.json({ error: 'SARVAM_API_KEY not configured' }, { status: 503 });
  }

  let body = {};
  try {
    body = await req.json();
  } catch (_) {
    body = {};
  }
  const text = body && typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }
  if (text.length > 2500) {
    return NextResponse.json(
      { error: 'text too long for one call (max 2500 characters)' },
      { status: 400 }
    );
  }

  try {
    const audio = await sarvamTTS({
      text,
      languageCode: body.languageCode,
      speaker: body.speaker,
      model: body.model,
    });
    return new NextResponse(audio, {
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502 });
  }
}
