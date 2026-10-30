import { Redis } from '@upstash/redis';
import { createMemoryStore, createRedisStore } from './rooms';

/* One shared store for the whole instance. On Vercel this must be Redis so
 * state is visible across instances; locally it falls back to memory. */
let store = null;

/* Accept either naming scheme:
 *  - UPSTASH_REDIS_REST_URL / _TOKEN     (manual Upstash setup)
 *  - KV_REST_API_URL / KV_REST_API_TOKEN (Vercel KV / Marketplace integration)
 * REDIS_URL is a redis:// TCP URL and is NOT usable with the REST client. */
function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

export function getStore() {
  if (store) return store;
  const cfg = redisConfig();
  if (cfg) {
    store = createRedisStore(new Redis(cfg));
  } else {
    store = createMemoryStore();
  }
  return store;
}

export function hasRedis() {
  return Boolean(redisConfig());
}
