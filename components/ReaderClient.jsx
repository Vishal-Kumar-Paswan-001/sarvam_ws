'use client';

import { useEffect, useRef, useState } from 'react';
import Nav from './Nav';

/* Document reader. Text comes from Sarvam Document AI (PDF) or the browser
 * (TXT/MD/paste). Voice comes from Sarvam Bulbul TTS, with the browser's
 * speech engine as a fallback when no key is configured. */

function splitSentences(text) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  const parts = cleaned.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) || [cleaned];
  return parts.map((s) => s.trim()).filter(Boolean);
}

function chunkText(text, max = 500) {
  const sentences = splitSentences(text);
  const chunks = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && (cur + ' ' + s).length > max) {
      chunks.push(cur);
      cur = s;
    } else {
      cur = cur ? cur + ' ' + s : s;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

export default function ReaderClient() {
  const [status, setStatus] = useState('');
  const [cls, setCls] = useState('');
  const [chunks, setChunks] = useState([]);
  const [cur, setCur] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reply, setReply] = useState('');
  const [rate, setRate] = useState(1);
  const fileRef = useRef(null);
  const pasteRef = useRef(null);
  const audioRef = useRef(null);
  const st = useRef({ idx: 0, playing: false, paused: false, sarvam: null, chunks: [] });

  useEffect(() => {
    st.current.chunks = chunks;
  }, [chunks]);

  function setMsg(t, c = '') {
    setStatus(t);
    setCls(c);
  }

  function loadText(text) {
    stop();
    const ch = chunkText(text);
    setChunks(ch);
    st.current.idx = 0;
    if (!ch.length) return setMsg('No readable text found.', 'err');
    setMsg(`Loaded ${ch.length} chunks. Press "Read aloud" or click a line.`, 'ok');
  }

  async function loadFile() {
    const file = fileRef.current && fileRef.current.files[0];
    if (!file) return setMsg('Choose a file first.', 'err');
    const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
    try {
      if (!isPdf) {
        const text = await file.text();
        return loadText(text);
      }
      setMsg('Uploading PDF to Sarvam Document AI…');
      const create = await fetch('/api/digitise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf' },
        body: file,
      });
      const cd = await create.json().catch(() => ({}));
      if (!create.ok) throw new Error(cd.error || 'Upload failed');
      const jobId = cd.jobId;
      setMsg('Digitising on Sarvam… this can take a little while.');
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const res = await fetch(`/api/digitise?jobId=${encodeURIComponent(jobId)}`);
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || 'Digitise failed');
        const s = String(d.status || '').toLowerCase();
        if (s === 'completed' || s === 'partially_completed') {
          return loadText(d.text || '');
        }
        if (s === 'failed' || s === 'rejected') throw new Error('Digitise ' + s);
        setMsg(`Digitising… (${s || 'running'})`);
      }
      throw new Error('Digitise timed out');
    } catch (e) {
      setMsg('Could not read the document: ' + (e.message || e), 'err');
    }
  }

  /* ---- speech ---- */
  async function speakFrom(i) {
    const c = st.current;
    if (!c.playing || i >= c.chunks.length) return finish();
    c.idx = i;
    setCur(i);
    const text = c.chunks[i];

    if (c.sarvam !== false) {
      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (res.status === 503) {
          c.sarvam = false; // no key -> fall back to browser voice
        } else if (res.ok) {
          c.sarvam = true;
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.playbackRate = rate;
          audioRef.current = audio;
          audio.onended = () => {
            URL.revokeObjectURL(url);
            if (c.playing && !c.paused) speakFrom(i + 1);
          };
          await audio.play();
          return;
        } else {
          c.sarvam = false;
        }
      } catch (_) {
        c.sarvam = false;
      }
    }

    // Browser fallback.
    const synth = window.speechSynthesis;
    if (!synth) return finish();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    u.onend = () => {
      if (c.playing && !c.paused) speakFrom(i + 1);
    };
    synth.speak(u);
  }

  function play() {
    if (!st.current.chunks.length) return setMsg('Load a document first.', 'err');
    st.current.playing = true;
    st.current.paused = false;
    setPlaying(true);
    setPaused(false);
    setMsg('Reading aloud…', 'ok');
    speakFrom(st.current.idx);
  }

  function pauseToggle() {
    const c = st.current;
    if (!c.playing) return;
    if (c.paused) {
      c.paused = false;
      setPaused(false);
      if (audioRef.current) audioRef.current.play();
      else window.speechSynthesis.resume();
      setMsg('Reading aloud…', 'ok');
    } else {
      c.paused = true;
      setPaused(true);
      if (audioRef.current) audioRef.current.pause();
      else window.speechSynthesis.pause();
      setMsg('Paused.');
    }
  }

  function stop() {
    const c = st.current;
    c.playing = false;
    c.paused = false;
    c.idx = 0;
    setPlaying(false);
    setPaused(false);
    setCur(-1);
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch (_) {}
      audioRef.current = null;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  function finish() {
    st.current.playing = false;
    setPlaying(false);
    setPaused(false);
    setCur(-1);
    setMsg('Finished reading.', 'ok');
  }

  async function sayReply() {
    const text = reply.trim();
    if (!text) return;
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 2500) }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const audio = new Audio(URL.createObjectURL(blob));
        audio.play();
        return;
      }
    } catch (_) {}
    const synth = window.speechSynthesis;
    if (synth) synth.speak(new SpeechSynthesisUtterance(text));
  }

  return (
    <main className="card wide">
      <Nav active="reader" />
      <span className="badge">Document reader · Sarvam voice</span>
      <h1>Read a document aloud</h1>
      <p className="sub">
        PDFs are read by Sarvam Document AI; voice is Sarvam Bulbul TTS (browser
        voice as fallback). Your API key stays server-side.
      </p>

      <div className="row">
        <input ref={fileRef} type="file" accept=".pdf,.txt,.md,.markdown" />
        <button onClick={loadFile}>Load file</button>
      </div>

      <label htmlFor="paste" style={{ marginTop: 14 }}>Or paste text</label>
      <textarea id="paste" ref={pasteRef} rows={4} placeholder="Paste text here…" />
      <div className="row" style={{ marginTop: 10 }}>
        <button className="secondary" onClick={() => loadText(pasteRef.current.value)}>
          Use pasted text
        </button>
      </div>

      <div className="row" style={{ marginTop: 18 }}>
        <button onClick={play} disabled={playing && !paused}>Read aloud</button>
        <button className="secondary" onClick={pauseToggle} disabled={!playing}>{paused ? 'Resume' : 'Pause'}</button>
        <button className="danger" onClick={() => { stop(); setMsg('Stopped.'); }} disabled={!playing}>Stop</button>
      </div>

      <div className="row" style={{ marginTop: 12, alignItems: 'center' }}>
        <label style={{ flex: '0 0 auto' }}>Speed</label>
        <input
          type="range" min="0.5" max="2" step="0.1" value={rate}
          onChange={(e) => setRate(parseFloat(e.target.value) || 1)}
        />
        <span style={{ flex: '0 0 auto' }}>{rate.toFixed(1)}x</span>
      </div>

      <div className={`status ${cls}`} role="status">{status}</div>

      <div className="doc">
        {chunks.map((c, i) => (
          <span
            key={i}
            className={cur === i ? 'speaking' : ''}
            onClick={() => {
              stop();
              st.current.idx = i;
              play();
            }}
          >
            {c}{' '}
          </span>
        ))}
      </div>

      <label htmlFor="reply" style={{ marginTop: 18 }}>Voice reply (speak any text)</label>
      <div className="row">
        <input
          id="reply" type="text" placeholder="Type something to speak…"
          value={reply} onChange={(e) => setReply(e.target.value)}
        />
        <button className="secondary" onClick={sayReply}>Speak</button>
      </div>
    </main>
  );
}
