'use strict';

/* Browser-side signaling client with automatic reconnect.
 * Vercel closes WebSocket connections at the function's max duration, so a
 * reconnect is expected, not an error. Backoff: 1s -> 30s, re-sending `join`
 * on every open. */

export function connectSignal({ room, role, onMessage, onStatus }) {
  let ws = null;
  let closed = false;
  let retry = 1000;
  let timer = null;

  function url() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/api/ws`;
  }

  function open() {
    ws = new WebSocket(url());
    ws.onopen = () => {
      retry = 1000;
      if (onStatus) onStatus('open');
      send({ type: 'join', room, role });
    };
    ws.onmessage = (e) => {
      let m;
      try {
        m = JSON.parse(e.data);
      } catch (_) {
        return;
      }
      if (onMessage) onMessage(m);
    };
    ws.onclose = () => {
      if (onStatus) onStatus('closed');
      if (!closed) {
        timer = setTimeout(open, retry);
        retry = Math.min(retry * 2, 30000);
      }
    };
    ws.onerror = () => {};
  }

  function send(obj) {
    try {
      if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
    } catch (_) {
      /* ignore */
    }
  }

  open();

  return {
    send,
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      try {
        if (ws) ws.close();
      } catch (_) {
        /* ignore */
      }
    },
  };
}

export async function loadIceServers() {
  try {
    const r = await fetch('/api/config');
    if (r.ok) {
      const d = await r.json();
      return d.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }];
    }
  } catch (_) {
    /* ignore */
  }
  return [{ urls: 'stun:stun.l.google.com:19302' }];
}
