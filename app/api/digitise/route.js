import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isAuthed } from '@/lib/auth';
import { createDigitiseJob, getDigitiseStatus } from '@/lib/sarvam';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* POST /api/digitise  -> create a Sarvam Document AI job, return its id.
 * GET  /api/digitise?jobId=... -> poll; when done, return the extracted text.
 *
 * Vercel functions can time out, so we never block for the whole job here:
 * the client creates the job, then polls this endpoint. */
export async function POST(req) {
  if (!isAuthed(cookies())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!process.env.SARVAM_API_KEY) {
    return NextResponse.json({ error: 'SARVAM_API_KEY not configured' }, { status: 503 });
  }

  const contentType = req.headers.get('content-type') || '';
  if (!/application\/pdf|application\/octet-stream/.test(contentType)) {
    return NextResponse.json({ error: 'send a PDF' }, { status: 415 });
  }

  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) {
    return NextResponse.json({ error: 'empty upload' }, { status: 400 });
  }
  // Vercel request body limit is ~4.5 MB; stay under it.
  if (buf.length > 4_000_000) {
    return NextResponse.json(
      { error: 'file too large for Vercel (max ~4 MB)' },
      { status: 413 }
    );
  }

  const language = req.nextUrl.searchParams.get('language') || 'en-IN';
  try {
    const jobId = await createDigitiseJob({
      buffer: buf,
      filename: 'document.pdf',
      contentType: 'application/pdf',
      language,
      outputFormat: 'md',
    });
    return NextResponse.json({ jobId });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502 });
  }
}

export async function GET(req) {
  if (!isAuthed(cookies())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!process.env.SARVAM_API_KEY) {
    return NextResponse.json({ error: 'SARVAM_API_KEY not configured' }, { status: 503 });
  }
  const jobId = req.nextUrl.searchParams.get('jobId');
  if (!jobId) {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
  }
  try {
    const result = await getDigitiseStatus(jobId);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502 });
  }
}
