import { Redis } from '@upstash/redis';
import { createMemoryStore, createRedisStore } from './rooms';

/* One shared store for the whole instance. On Vercel this must be Redis so
 * state is visible across instances; locally it falls back to memory. */
let store = null;

export function getStore() {
  if (store) return store;
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    store = createRedisStore(redis);
  } else {
    store = createMemoryStore();
  }
  return store;
}

export function hasRedis() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}
