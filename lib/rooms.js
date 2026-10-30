'use strict';

/*
 * Room manager for the signaling relay.
 *
 * A WebSocket connection is pinned to one serverless instance. Local sockets
 * live in an in-memory map on that instance; anything addressed to a socket on
 * another instance is delivered through the shared store (Redis on Vercel) via
 * a per-socket mailbox list that the owning instance drains on a short interval.
 *
 * The store is injected, so the logic is identical against Redis or the
 * in-memory store used for local dev and tests.
 */

const HEARTBEAT_MS = 30_000;
const PRESENCE_TTL_SEC = 90;
const MAILBOX_TTL_SEC = 60;

function makeId() {
  return (
    Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
  );
}

function rawSend(ws, obj) {
  try {
    if (ws.readyState === 1) ws.send(JSON.stringify(obj));
  } catch (_) {
    /* ignore */
  }
}

export function createRoomManager(store, opts = {}) {
  const pollMs = opts.pollMs || 250;
  const local = new Map(); // id -> { ws, room, role, hb, poll }
  const rooms = new Map(); // room -> { sourceId, viewerIds:Set }

  function roomState(room) {
    let r = rooms.get(room);
    if (!r) {
      r = { sourceId: null, viewerIds: new Set() };
      rooms.set(room, r);
    }
    return r;
  }

  async function deliverTo(targetId, msg) {
    const l = local.get(targetId);
    if (l) {
      rawSend(l.ws, msg);
      return true;
    }
    await store.rpush('mb:' + targetId, JSON.stringify(msg));
    await store.expire('mb:' + targetId, MAILBOX_TTL_SEC);
    return false;
  }

  async function drainMailbox(id) {
    for (;;) {
      const raw = await store.lpop('mb:' + id);
      if (!raw) break;
      const l = local.get(id);
      if (!l) break;
      try {
        rawSend(l.ws, JSON.parse(raw));
      } catch (_) {
        /* ignore */
      }
    }
  }

  async function findMembers(room, role) {
    const members = await store.smembers('room:' + room);
    const out = [];
    for (const m of members) {
      const r = await store.get('role:' + m);
      if (r === role) out.push(m);
    }
    return out;
  }

  async function join(ws, { room, role }) {
    const id = makeId();
    ws.__id = id;
    local.set(id, { ws, room, role, hb: null, poll: null });
    const st = roomState(room);

    if (role === 'source') {
      if (st.sourceId) {
        rawSend(ws, { type: 'error', error: 'room already has a source' });
        local.delete(id);
        return id;
      }
      st.sourceId = id;
    } else {
      st.viewerIds.add(id);
    }

    await store.sadd('room:' + room, id);
    await store.set('role:' + id, role, PRESENCE_TTL_SEC);
    await store.set('roomof:' + id, room, PRESENCE_TTL_SEC);

    const entry = local.get(id);
    entry.hb = setInterval(() => {
      store.set('role:' + id, role, PRESENCE_TTL_SEC).catch(() => {});
      store.set('roomof:' + id, room, PRESENCE_TTL_SEC).catch(() => {});
    }, HEARTBEAT_MS);
    if (entry.hb.unref) entry.hb.unref();

    entry.poll = setInterval(() => {
      drainMailbox(id).catch(() => {});
    }, pollMs);
    if (entry.poll.unref) entry.poll.unref();

    if (role === 'source') {
      const viewers = await findMembers(room, 'viewer');
      rawSend(ws, { type: 'joined', role, selfId: id, viewers });
      for (const v of viewers) {
        await deliverTo(v, { type: 'source-available', sourceId: id });
      }
    } else {
      const sources = await findMembers(room, 'source');
      const sourceId = sources[0] || null;
      rawSend(ws, { type: 'joined', role, selfId: id, sourceId });
      if (sourceId) {
        await deliverTo(sourceId, { type: 'viewer-joined', viewerId: id });
      }
    }
    return id;
  }

  async function signal(fromId, toId, data) {
    if (!toId) return;
    await deliverTo(toId, { type: 'signal', from: fromId, data });
  }

  async function leave(id) {
    const l = local.get(id);
    if (!l) return;
    if (l.hb) clearInterval(l.hb);
    if (l.poll) clearInterval(l.poll);
    local.delete(id);

    const st = rooms.get(l.room);
    if (st) {
      if (st.sourceId === id) st.sourceId = null;
      st.viewerIds.delete(id);
    }

    await store.srem('room:' + l.room, id).catch(() => {});
    await store.del('role:' + id).catch(() => {});
    await store.del('roomof:' + id).catch(() => {});

    if (l.role === 'viewer' && st && st.sourceId) {
      await deliverTo(st.sourceId, { type: 'viewer-left', viewerId: id });
    }
    if (l.role === 'source') {
      const viewers = await findMembers(l.room, 'viewer').catch(() => []);
      for (const v of viewers) {
        await deliverTo(v, { type: 'source-left' });
      }
    }
  }

  return { join, signal, leave, _local: local, _rooms: rooms };
}

/* ------------------------------------------------------------------ *
 * Stores
 * ------------------------------------------------------------------ */
export function createMemoryStore() {
  const kv = new Map();
  const sets = new Map();
  const lists = new Map();
  const now = () => Date.now();

  function alive(k) {
    const e = kv.get(k);
    if (!e) return null;
    if (e.exp && e.exp < now()) {
      kv.delete(k);
      return null;
    }
    return e.val;
  }

  return {
    async sadd(k, m) {
      if (!sets.has(k)) sets.set(k, new Set());
      sets.get(k).add(m);
    },
    async srem(k, m) {
      if (sets.has(k)) sets.get(k).delete(m);
    },
    async smembers(k) {
      return [...(sets.get(k) || [])];
    },
    async set(k, v, ttl) {
      kv.set(k, { val: v, exp: ttl ? now() + ttl * 1000 : 0 });
    },
    async get(k) {
      return alive(k);
    },
    async del(k) {
      kv.delete(k);
      sets.delete(k);
      lists.delete(k);
    },
    async rpush(k, v) {
      if (!lists.has(k)) lists.set(k, []);
      lists.get(k).push(v);
    },
    async lpop(k) {
      const l = lists.get(k);
      if (!l || !l.length) return null;
      return l.shift();
    },
    async expire(k, ttl) {
      const e = kv.get(k);
      if (e) e.exp = now() + ttl * 1000;
    },
    async incr(k, ttl) {
      const cur = parseInt(alive(k) || '0', 10) + 1;
      const existing = kv.get(k);
      const exp = existing && existing.exp ? existing.exp : ttl ? now() + ttl * 1000 : 0;
      kv.set(k, { val: String(cur), exp });
      return cur;
    },
  };
}

export function createRedisStore(redis) {
  return {
    async sadd(k, m) {
      await redis.sadd(k, m);
    },
    async srem(k, m) {
      await redis.srem(k, m);
    },
    async smembers(k) {
      return (await redis.smembers(k)) || [];
    },
    async set(k, v, ttl) {
      await redis.set(k, v, { ex: ttl });
    },
    async get(k) {
      return await redis.get(k);
    },
    async del(k) {
      await redis.del(k);
    },
    async rpush(k, v) {
      await redis.rpush(k, v);
    },
    async lpop(k) {
      return await redis.lpop(k);
    },
    async expire(k, ttl) {
      await redis.expire(k, ttl);
    },
    async incr(k, ttl) {
      const n = await redis.incr(k);
      if (n === 1 && ttl) await redis.expire(k, ttl);
      return n;
    },
  };
}
