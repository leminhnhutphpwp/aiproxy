# Redis & Caching Strategies

## Data Types
| Type | Use Case | Example |
|------|----------|---------|
| String | Simple cache, counters, session tokens | `SET user:1:name "John"` |
| Hash | Object cache | `HSET user:1 name "John" age 30` |
| List | Message queues, recent items | `LPUSH messages "task1"` |
| Set | Unique members | `SADD tags:post:1 "redis" "cache"` |
| Sorted Set | Leaderboards, rate limiting | `ZADD leaderboard 100 "user:1"` |
| Stream | Event log, message queue (Kafka-like) | `XADD events * type "login" userId 1` |
| HyperLogLog | Unique count approximations | `PFADD visits:today "user:1"` |

## Caching Patterns
```javascript
// Cache-Aside (most common)
async function getUser(id) {
  const cached = await redis.get(`user:${id}`);
  if (cached) return JSON.parse(cached);

  const user = await db.users.findUnique({ where: { id } });
  await redis.set(`user:${id}`, JSON.stringify(user), 'EX', 3600);  // TTL 1 hour
  return user;
}

// Cache-Through (read-through with write-back)
// Use Redis as primary cache, DB as backing store
// All reads go through Redis (cache miss → auto-fill from DB)
// All writes go to DB + invalidate cache
```

## TTL Strategies
- Static content (CSS, JS, images): 1-7 days
- API responses (posts, products): 5-30 minutes
- User data (profile, settings): 1-2 hours
- Rate limit counters: 1 second to 1 minute
- Session data: until logout or 24-hour refresh

## Session Storage
```javascript
// Express session with Redis
const session = require('express-session');
const RedisStore = require('connect-redis')(session);

app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: true, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 },
}));
```

## Rate Limiting
```javascript
// Sliding window with sorted sets
async function checkRateLimit(userId, limit = 100, window = 60) {
  const now = Date.now();
  const key = `ratelimit:${userId}`;
  const windowStart = now - window * 1000;

  // Remove old entries and add current
  await redis.zremrangebyscore(key, 0, windowStart);
  await redis.zadd(key, now, `${now}:${Math.random()}`);

  // Count in current window
  const count = await redis.zcard(key);
  if (count > limit) return false;  // Rate limited

  await redis.expire(key, window);  // Reset TTL
  return true;  // OK
}
```

## Pub/Sub
```javascript
// Publisher
await redis.publish('channel:notifications', JSON.stringify({ userId: 1, message: 'New message' }));

// Subscriber (separate connection)
const subscriber = redis.duplicate();
await subscriber.subscribe('channel:notifications', (message) => {
  const { userId, message: msg } = JSON.parse(message);
  notifyUser(userId, msg);
});
```

## Redis Stack
- RediSearch: full-text search with auto-complete, faceted search
- RedisJSON: native JSON document operations
- RedisTimeSeries: time-series data with downsampling
- RedisBloom: probabilistic data structures (Bloom filter, Cuckoo filter)

## Performance
- Pipeline commands: `redis.pipeline().set('a', 1).set('b', 2).exec()`
- Use SCAN instead of KEYS (KEYS blocks the event loop)
- Connect pooling: reuse connections, don't create per request
- Monitor: `redis INFO`, `redis SLOWLOG`, `redis MONITOR`
- Memory: set `maxmemory` and `maxmemory-policy allkeys-lru`

## Eviction Policies
| Policy | Behavior |
|--------|----------|
| `noeviction` | Return errors on write when memory full |
| `allkeys-lru` | Evict least-recently-used keys |
| `volatile-lru` | Evict LRU keys with TTL set |
| `allkeys-lfu` | Evict least-frequently-used keys |
| `volatile-ttl` | Evict keys with shortest TTL |

## Common Mistakes
- ❌ No TTL on cached data (memory fills up forever)
- ❌ Storing large strings/objects in Redis (use compression or split)
- ❌ Using KEYS command in production (blocks Redis for millions of keys)
- ❌ Not handling cache failures gracefully (app crashes without Redis)
- ❌ Cache stampede: many requests recalculate at once — use locking or stale-while-revalidate
