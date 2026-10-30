import assert from 'node:assert';
import { createRoomManager, createMemoryStore } from '../lib/rooms.js';

function fakeWs() {
  return {
    readyState: 1,
    sent: [],
    send(x) {
      this.sent.push(JSON.parse(x));
    },
    close() {
      this.readyState = 3;
    },
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass++;
    console.log('  PASS  ' + name);
  } else {
    fail++;
    console.log('  FAIL  ' + name);
  }
}

const store = createMemoryStore();
const A = createRoomManager(store, { pollMs: 15 }); // "instance A"
const B = createRoomManager(store, { pollMs: 15 }); // "instance B"

// --- same instance ---
const src = fakeWs();
const vw = fakeWs();
await A.join(src, { room: 'r1', role: 'source' });
await A.join(vw, { room: 'r1', role: 'viewer' });

check('source notified of local viewer', src.sent.some((m) => m.type === 'viewer-joined'));
const vwJoined = vw.sent.find((m) => m.type === 'joined');
check('viewer received sourceId', Boolean(vwJoined && vwJoined.sourceId));

await A.signal(src.__id, vwJoined.selfId, { ping: 1 });
check('local signal delivered', vw.sent.some((m) => m.type === 'signal' && m.data.ping === 1));

// --- cross instance (source on A, viewer on B) ---
const src2 = fakeWs();
const vw2 = fakeWs();
await A.join(src2, { room: 'r2', role: 'source' });
await B.join(vw2, { room: 'r2', role: 'viewer' });
await wait(100);
check('cross-instance: source told about remote viewer', src2.sent.some((m) => m.type === 'viewer-joined'));

const vw2Joined = vw2.sent.find((m) => m.type === 'joined');
await A.signal(src2.__id, vw2Joined.selfId, { ping: 2 });
await wait(100);
check('cross-instance signal delivered via mailbox', vw2.sent.some((m) => m.type === 'signal' && m.data.ping === 2));

// --- second source refused ---
const src3 = fakeWs();
await A.join(src3, { room: 'r2', role: 'source' });
check('second source in a room refused', src3.sent.some((m) => m.type === 'error'));

// --- leave notifies counterpart ---
await A.leave(src2.__id);
await wait(100);
check('viewer told the source left', vw2.sent.some((m) => m.type === 'source-left'));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
