import Redis from 'ioredis'

// Always create a fresh client per operation — ioredis clients in subscribe mode
// cannot be reused for publish and vice versa.
export function createRedisClient(): Redis {
  return new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  })
}
