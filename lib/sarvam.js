import { unzipSync } from 'fflate';

const BASE = 'https://api.sarvam.ai';

function key() {
  const k = process.env.SARVAM_API_KEY;
  if (!k) throw new Error('SARVAM_API_KEY is not set');
  return k;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ------------------------------------------------------------------ *
 * Text-to-speech (Bulbul). REST endpoint returns base64 audio.
 * Max 2500 characters per call.
 * ------------------------------------------------------------------ */
export async function sarvamTTS({ text, languageCode, speaker, model }) {
  const res = await fetch(`${BASE}/text-to-speech`, {
    method: 'POST',
    headers: {
      'api-subscription-key': key(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      language_code: languageCode || process.env.SARVAM_TTS_LANGUAGE || 'en-IN',
      speaker: speaker || process.env.SARVAM_TTS_SPEAKER || 'shubh_enhi_ads',
      model: model || process.env.SARVAM_TTS_MODEL || 'bulbul:v4-flash',
      speech_sample_rate: 22050,
      output_audio_codec: 'mp3',
      enable_preprocessing: true,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Sarvam TTS ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const b64 = data.audios && data.audios[0];
  if (!b64) throw new Error('Sarvam TTS returned no audio');
  return Buffer.from(b64, 'base64');
}

/* ------------------------------------------------------------------ *
 * Document AI (Sarvam Vision) — job lifecycle:
 *   create (multipart) -> poll status -> download-url (a ZIP).
 * We extract the first Markdown/HTML/JSON entry from the ZIP as text.
 * ------------------------------------------------------------------ */
export async function createDigitiseJob({ buffer, filename, contentType, language, outputFormat }) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: contentType || 'application/pdf' }), filename || 'document.pdf');
  form.append('language', language || 'en-IN');
  form.append('output_format', outputFormat || 'md');

  const res = await fetch(`${BASE}/doc-ai/v1/job/digitise`, {
    method: 'POST',
    headers: { 'api-subscription-key': key() },
    body: form,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Sarvam digitise create ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data.job_id) throw new Error('Sarvam digitise returned no job_id');
  return data.job_id;
}

export async function getDigitiseStatus(jobId) {
  const res = await fetch(`${BASE}/doc-ai/v1/job/${encodeURIComponent(jobId)}/status`, {
    headers: { 'api-subscription-key': key() },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Sarvam digitise status ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const status = String(data.status || '').toLowerCase();
  if (status !== 'completed' && status !== 'partially_completed') {
    return { status };
  }

  const dlRes = await fetch(`${BASE}/doc-ai/v1/job/${encodeURIComponent(jobId)}/download-url`, {
    headers: { 'api-subscription-key': key() },
  });
  if (!dlRes.ok) {
    const t = await dlRes.text();
    throw new Error(`Sarvam digitise download-url ${dlRes.status}: ${t.slice(0, 200)}`);
  }
  const dl = await dlRes.json();
  const url = dl.url || (dl.download_url && dl.download_url.url);
  if (!url) throw new Error('Sarvam digitise returned no download URL');

  const zipRes = await fetch(url);
  if (!zipRes.ok) throw new Error(`Could not fetch result ZIP (${zipRes.status})`);
  const zipBuf = new Uint8Array(await zipRes.arrayBuffer());

  let text = '';
  try {
    const files = unzipSync(zipBuf);
    // Prefer markdown, then html, then any json text.
    const names = Object.keys(files);
    const pick =
      names.find((n) => n.toLowerCase().endsWith('.md')) ||
      names.find((n) => n.toLowerCase().endsWith('.html')) ||
      names.find((n) => n.toLowerCase().endsWith('.txt'));
    if (pick) text = new TextDecoder().decode(files[pick]);
    else {
      // fall back to concatenating any text-ish entries
      text = names
        .filter((n) => /\.(json|md|html|txt)$/i.test(n))
        .map((n) => new TextDecoder().decode(files[n]))
        .join('\n');
    }
  } catch (_) {
    text = '';
  }

  return { status, text: cleanMarkup(text) };
}

function cleanMarkup(s) {
  if (!s) return '';
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_`>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export { sleep };
