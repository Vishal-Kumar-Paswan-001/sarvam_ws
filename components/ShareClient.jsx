'use client';

import { useEffect, useRef, useState } from 'react';
import Nav from './Nav';
import { connectSignal, loadIceServers } from '@/lib/signal-client';

export default function ShareClient() {
  const [status, setStatus] = useState('');
  const [cls, setCls] = useState('');
  const [sharing, setSharing] = useState(false);
  const [link, setLink] = useState('');
  const videoRef = useRef(null);
  const s = useRef({ room: 'main', stream: null, sig: null, ice: null, peers: new Map() });

  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get('room') || 'main';
    s.current.room = room;
    setLink(`${window.location.origin}/view?room=${encodeURIComponent(room)}`);
  }, []);

  function closePeer(id) {
    const st = s.current;
    const pc = st.peers.get(id);
    if (pc) {
      try { pc.close(); } catch (_) {}
      st.peers.delete(id);
    }
  }

  async function offerTo(viewerId) {
    const st = s.current;
    if (!st.stream) return;
    const pc = new RTCPeerConnection({ iceServers: st.ice });
    st.stream.getTracks().forEach((t) => pc.addTrack(t, st.stream));
    pc.onicecandidate = (e) => {
      if (e.candidate) st.sig.send({ type: 'signal', to: viewerId, data: { candidate: e.candidate } });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') closePeer(viewerId);
    };
    st.peers.set(viewerId, pc);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    st.sig.send({ type: 'signal', to: viewerId, data: { sdp: pc.localDescription } });
  }

  async function onSignal(from, data) {
    const pc = s.current.peers.get(from);
    if (!pc) return;
    if (data.sdp) await pc.setRemoteDescription(data.sdp);
    else if (data.candidate) {
      try { await pc.addIceCandidate(data.candidate); } catch (_) {}
    }
  }

  function connect() {
    const st = s.current;
    st.sig = connectSignal({
      room: st.room,
      role: 'source',
      onStatus: (x) => { if (x === 'closed') setStatus('Signalling reconnecting…'); },
      onMessage: async (msg) => {
        if (msg.type === 'joined') {
          for (const v of msg.viewers || []) await offerTo(v);
          setStatus(`Broadcasting. Viewers connected: ${(msg.viewers || []).length}`);
          setCls('ok');
        } else if (msg.type === 'viewer-joined') {
          await offerTo(msg.viewerId);
        } else if (msg.type === 'viewer-left') {
          closePeer(msg.viewerId);
        } else if (msg.type === 'signal') {
          await onSignal(msg.from, msg.data);
        } else if (msg.type === 'error') {
          setStatus('Error: ' + msg.error);
          setCls('err');
        }
      },
    });
  }

  async function start() {
    setStatus('Starting…');
    setCls('');
    try {
      s.current.ice = await loadIceServers();
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      s.current.stream = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      const vt = stream.getVideoTracks()[0];
      if (vt) vt.onended = () => stop();
      connect();
      setSharing(true);
      setStatus('Waiting for viewers…');
      setCls('ok');
    } catch (e) {
      setStatus('Could not start sharing: ' + (e && e.message ? e.message : e));
      setCls('err');
    }
  }

  function stop() {
    const st = s.current;
    for (const id of [...st.peers.keys()]) closePeer(id);
    if (st.stream) {
      st.stream.getTracks().forEach((t) => t.stop());
      st.stream = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    if (st.sig) {
      try { st.sig.send({ type: 'bye' }); st.sig.close(); } catch (_) {}
      st.sig = null;
    }
    setSharing(false);
    setStatus('Stopped.');
    setCls('');
  }

  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <main className="card wide">
      <Nav active="share" />
      <span className="badge ro">Read-only broadcast</span>
      <h1>Share your screen</h1>
      <p className="sub">
        Viewers can watch this stream but can never send input to this machine.
      </p>
      <div className="row">
        <button onClick={start} disabled={sharing}>Start sharing</button>
        <button className="danger" onClick={stop} disabled={!sharing}>Stop</button>
        <button className="secondary" onClick={logout}>Sign out</button>
      </div>
      <div className={`status ${cls}`} role="status">{status}</div>
      <div style={{ marginTop: 16 }}>
        <video ref={videoRef} muted autoPlay playsInline />
      </div>
      <p className="hint">
        Share link (viewers must sign in first):<br />{link || '—'}
      </p>
    </main>
  );
}
