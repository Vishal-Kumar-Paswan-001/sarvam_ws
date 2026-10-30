'use client';

import { useEffect, useRef, useState } from 'react';
import Nav from './Nav';
import { connectSignal, loadIceServers } from '@/lib/signal-client';

const ROOM = 'demo-room';
const STEPS = [
  ['server', 'Signalling socket connected'],
  ['source-joined', 'Source joined the room'],
  ['viewer-joined', 'Viewer joined the room'],
  ['offer', 'Offer created & sent'],
  ['answer', 'Answer received'],
  ['ice', 'ICE / peer connected'],
  ['media', 'Media flowing'],
];

export default function DemoClient() {
  const [logs, setLogs] = useState([]);
  const [done, setDone] = useState({});
  const [fps, setFps] = useState('0 fps');
  const [running, setRunning] = useState(false);
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const s = useRef({
    ice: null, stream: null, anim: null, raf: null,
    src: null, vw: null, pcSource: null, pcViewer: null, pending: [],
  });

  function log(m) {
    setLogs((l) => [...l, `${new Date().toLocaleTimeString()}  ${m}`].slice(-300));
  }
  function mark(id) {
    setDone((d) => (d[id] ? d : { ...d, [id]: true }));
  }

  function drawFrame(t) {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    const w = c.width;
    const h = c.height;
    const hue = (t / 40) % 360;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, `hsl(${hue}, 70%, 24%)`);
    g.addColorStop(1, `hsl(${(hue + 90) % 360}, 70%, 12%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const x = (Math.sin(t / 900) * 0.5 + 0.5) * (w - 150);
    ctx.fillStyle = `hsl(${(hue + 180) % 360}, 85%, 60%)`;
    ctx.fillRect(x, h / 2 - 70, 150, 150);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = '26px system-ui, sans-serif';
    ctx.fillText('SafeScreen demo pattern', w / 2, 56);
    ctx.font = '18px monospace';
    ctx.fillText(new Date().toLocaleTimeString(), w / 2, h - 34);
  }

  async function offerTo(viewerId) {
    const st = s.current;
    if (!st.stream) return;
    st.pcSource = new RTCPeerConnection({ iceServers: st.ice });
    st.stream.getTracks().forEach((t) => st.pcSource.addTrack(t, st.stream));
    st.pcSource.onicecandidate = (e) => {
      if (e.candidate) st.src.send({ type: 'signal', to: viewerId, data: { candidate: e.candidate } });
    };
    const offer = await st.pcSource.createOffer();
    await st.pcSource.setLocalDescription(offer);
    mark('offer');
    log('Offer created and sent to viewer.');
    st.src.send({ type: 'signal', to: viewerId, data: { sdp: st.pcSource.localDescription } });
  }

  async function sourceOnSignal(data) {
    const st = s.current;
    if (!st.pcSource) return;
    if (data.sdp) {
      await st.pcSource.setRemoteDescription(data.sdp);
      mark('answer');
      log('Answer received from viewer.');
    } else if (data.candidate) {
      try { await st.pcSource.addIceCandidate(data.candidate); } catch (_) {}
    }
  }

  async function viewerOnSignal(from, data) {
    const st = s.current;
    if (data.sdp && data.sdp.type === 'offer') {
      st.pcViewer = new RTCPeerConnection({ iceServers: st.ice });
      st.pcViewer.onicecandidate = (e) => {
        if (e.candidate) st.vw.send({ type: 'signal', to: from, data: { candidate: e.candidate } });
      };
      st.pcViewer.onconnectionstatechange = () => {
        log('viewer peer: ' + st.pcViewer.connectionState);
        if (st.pcViewer.connectionState === 'connected') mark('ice');
      };
      st.pcViewer.ontrack = (e) => {
        if (e.streams && e.streams[0] && videoRef.current) {
          videoRef.current.srcObject = e.streams[0];
          mark('media');
          log('Media flowing — the received stream is playing.');
          startFps();
        }
      };
      await st.pcViewer.setRemoteDescription(data.sdp);
      for (const c of st.pending.splice(0)) {
        try { await st.pcViewer.addIceCandidate(c); } catch (_) {}
      }
      const ans = await st.pcViewer.createAnswer();
      await st.pcViewer.setLocalDescription(ans);
      log('Answer created and sent to source.');
      st.vw.send({ type: 'signal', to: from, data: { sdp: st.pcViewer.localDescription } });
    } else if (data.candidate) {
      if (st.pcViewer && st.pcViewer.remoteDescription) {
        try { await st.pcViewer.addIceCandidate(data.candidate); } catch (_) {}
      } else {
        st.pending.push(data.candidate);
      }
    }
  }

  function startFps() {
    const v = videoRef.current;
    if (!v || !('requestVideoFrameCallback' in v)) {
      setFps('streaming');
      return;
    }
    let count = 0;
    let last = performance.now();
    const tick = (now) => {
      count++;
      if (now - last >= 1000) {
        setFps(`${count} fps`);
        count = 0;
        last = now;
      }
      s.current.raf = v.requestVideoFrameCallback(tick);
    };
    s.current.raf = v.requestVideoFrameCallback(tick);
  }

  async function start() {
    if (running) return;
    setRunning(true);
    setLogs([]);
    setDone({});
    setFps('0 fps');

    const st = s.current;
    st.ice = await loadIceServers();

    const c = canvasRef.current;
    const animate = () => {
      drawFrame(performance.now());
      st.anim = requestAnimationFrame(animate);
    };
    animate();
    st.stream = c.captureStream(30);
    log('Canvas capture started (30 fps synthetic pattern).');

    st.src = connectSignal({
      room: ROOM, role: 'source',
      onStatus: (x) => { if (x === 'open') { mark('server'); log('Source socket connected to the relay.'); } },
      onMessage: async (msg) => {
        if (msg.type === 'joined') {
          mark('source-joined');
          log(`Source joined room as ${String(msg.selfId).slice(0, 8)}…`);
          for (const v of msg.viewers || []) await offerTo(v);
        } else if (msg.type === 'viewer-joined') {
          log('Viewer joined — creating an offer.');
          await offerTo(msg.viewerId);
        } else if (msg.type === 'signal') {
          await sourceOnSignal(msg.data);
        }
      },
    });

    st.vw = connectSignal({
      room: ROOM, role: 'viewer',
      onStatus: () => {},
      onMessage: async (msg) => {
        if (msg.type === 'joined') {
          mark('viewer-joined');
          log('Viewer joined room.');
        } else if (msg.type === 'signal') {
          await viewerOnSignal(msg.from, msg.data);
        } else if (msg.type === 'source-left') {
          log('Source left the room.');
        }
      },
    });
  }

  function stop() {
    const st = s.current;
    setRunning(false);
    if (st.anim) cancelAnimationFrame(st.anim);
    [st.pcSource, st.pcViewer].forEach((pc) => { try { if (pc) pc.close(); } catch (_) {} });
    st.pcSource = st.pcViewer = null;
    if (st.stream) st.stream.getTracks().forEach((t) => t.stop());
    st.stream = null;
    [st.src, st.vw].forEach((x) => { try { if (x) x.close(); } catch (_) {} });
    st.src = st.vw = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    log('Demo stopped.');
  }

  useEffect(() => () => stop(), []);

  return (
    <main className="card wide">
      <Nav active="demo" />
      <span className="badge">Live demo · one tab, no second device</span>
      <h1>Watch the whole pipeline run</h1>
      <p className="sub">
        Both ends of a real session run in this page: a synthetic screen is
        captured, signalling goes through the actual relay, and a real WebRTC
        connection streams it back. Nothing is simulated.
      </p>
      <div className="row">
        <button onClick={start} disabled={running}>Start demo</button>
        <button className="danger" onClick={stop} disabled={!running}>Stop</button>
      </div>

      <div className="demo-grid">
        <div>
          <h2 className="mini">Steps</h2>
          <ul className="steps">
            {STEPS.map(([id, label]) => (
              <li key={id} className={done[id] ? 'done' : ''}>{label}</li>
            ))}
          </ul>
          <div className="fps">{fps}</div>
          <h2 className="mini">Source pattern (what is being sent)</h2>
          <canvas ref={canvasRef} width={640} height={360} />
        </div>
        <div>
          <h2 className="mini">Received stream (what a viewer sees)</h2>
          <video ref={videoRef} autoPlay playsInline muted />
          <h2 className="mini">Event log</h2>
          <div className="log">
            {logs.map((l, i) => (<div key={i} className="logline">{l}</div>))}
          </div>
        </div>
      </div>

      <p className="hint">
        On Vercel the relay runs as a function and state lives in Redis; the demo
        proves the end-to-end path from this one page.
      </p>
    </main>
  );
}
