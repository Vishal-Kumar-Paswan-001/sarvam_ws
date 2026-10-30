import { experimental_upgradeWebSocket } from '@vercel/functions';
import { cookies } from 'next/headers';
import { isAuthed } from '@/lib/auth';
import { getStore } from '@/lib/store';
import { createRoomManager } from '@/lib/rooms';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 800;

/* One manager per instance. Local sockets live in its memory; cross-instance
 * delivery goes through the shared store (Redis on Vercel). */
let manager = null;
function getManager() {
  if (!manager) manager = createRoomManager(getStore());
  return manager;
}

export async function GET() {
  if (!isAuthed(cookies())) {
    return new Response('Unauthorized', { status: 401 });
  }

  const m = getManager();

  return experimental_upgradeWebSocket((ws) => {
    ws.on('message', async (buf) => {
      let msg;
      try {
        msg = JSON.parse(buf.toString());
      } catch (_) {
        return;
      }
      if (!msg || typeof msg.type !== 'string') return;

      if (msg.type === 'join') {
        const room = String(msg.room || 'main').slice(0, 64);
        const role = msg.role === 'source' ? 'source' : 'viewer';
        await m.join(ws, { room, role });
      } else if (msg.type === 'signal') {
        if (ws.__id) await m.signal(ws.__id, String(msg.to || ''), msg.data);
      } else if (msg.type === 'bye') {
        ws.close();
      }
    });

    ws.on('close', async () => {
      if (ws.__id) await m.leave(ws.__id);
    });
  });
}
