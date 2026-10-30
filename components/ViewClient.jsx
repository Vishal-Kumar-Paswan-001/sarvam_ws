'use client';

import { useEffect, useRef, useState } from 'react';
import Nav from './Nav';
import { connectSignal, loadIceServers } from '@/lib/signal-client';

export default function ViewClient() {
  const [status, setStatus] = useState('Connecting…');
  const [cls, setCls] = useState('');
  const videoRef = useRef(null);
  const s = useRef({ room: 'main', sig: null, ice: null, pc: null, sourceId: null, pending: [] });

  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get('room') || 'main';
    s.current.room = room;
    let cancelled = false;
    (async () => {
      s.current.ice = await loadIceServers();
      if (!cancelled) connect();
    })();
    return () => {
      cancelled = true;
      if (s.current.sig) s.current.sig.close();
      if (s.current.pc) {
        try { s.current.pc.close(); } catch (_) {}
      }
    };
  }, []);

  function createPeer() {
    const st = s.current;
    const pc = new RTCPeerConnection({ iceServers: st.ice });
    pc.onicecandidate = (e) => {
      if (e.candidate && st.sourceId) {
        st.sig.send({ type: 'signal', to: st.sourceId, data: { candidate: e.candidate } });
      }
    };
    pc.ontrack = (e) => {
      if (e.streams && e.streams[0] && videoRef.current) {
        videoRef.current.srcObject = e.streams[0];
        setStatus('Live.');
        setCls('ok');
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        setStatus('Connection failed.');
        setCls('err');
      }
    };
    return pc;
  }

  async function onSignal(data) {
    const st = s.current;
    if (data.sdp && data.sdp.type === 'offer') {
      st.pc = createPeer();
      await st.pc.setRemoteDescription(data.sdp);
      for (const c of st.pending.splice(0)) {
        try { await st.pc.addIceCandidate(c); } catch (_) {}
      }
      const ans = await st.pc.createAnswer();
      await st.pc.setLocalDescription(ans);
      st.sig.send({ type: 'signal', to: st.sourceId, data: { sdp: st.pc.localDescription } });
    } else if (data.candidate) {
      if (st.pc && st.pc.remoteDescription) {
        try { await st.pc.addIceCandidate(data.candidate); } catch (_) {}
      } else {
        st.pending.push(data.candidate);
      }
    }
  }

  function connect() {
    const st = s.current;
    st.sig = connectSignal({
      room: st.room,
      role: 'viewer',
      onStatus: (x) => { if (x === 'closed') setStatus('Signalling reconnecting…'); },
      onMessage: async (msg) => {
        if (msg.type === 'joined') {
          st.sourceId = msg.sourceId || null;
          if (!st.sourceId) {
            setStatus('Waiting for the host to start sharing…');
            setCls('');
          }
        } else if (msg.type === 'source-available') {
          st.sourceId = msg.sourceId;
        } else if (msg.type === 'signal') {
          st.sourceId = msg.from;
          await onSignal(msg.data);
        } else if (msg.type === 'source-left') {
          setStatus('The host stopped sharing.');
          setCls('');
          if (st.pc) {
            try { st.pc.close(); } catch (_) {}
            st.pc = null;
          }
          if (videoRef.current) videoRef.current.srcObject = null;
        }
      },
    });
  }

  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <main className="card wide">
      <Nav active="view" />
      <span className="badge">Watch-only</span>
      <h1>Live view</h1>
      <p className="sub">You are viewing a read-only stream. You cannot control the host.</p>
      <div className="row">
        <button className="secondary" onClick={logout}>Sign out</button>
      </div>
      <div className={`status ${cls}`} role="status">{status}</div>
      <div style={{ marginTop: 16 }}>
        <video ref={videoRef} autoPlay playsInline />
      </div>
    </main>
  );
}
