# Serverless & Edge Computing

## Core Concepts
- Serverless: code runs on-demand, pay per execution, no server management
- Edge: code runs at CDN edge nodes closest to users (global, low latency)
- Cold start: delay when function spins up from idle — optimize for this
- Warm start: function instance reused for subsequent requests

## AWS Lambda
```javascript
// handler.mjs
export const handler = async (event) => {
  const { httpMethod, path, body, queryStringParameters } = event;
  try {
    if (httpMethod === 'GET' && path === '/users') {
      const users = await db.scan({ TableName: 'Users' }).promise();
      return { statusCode: 200, body: JSON.stringify(users.Items), headers: { 'Content-Type': 'application/json' } };
    }
    return { statusCode: 404, body: 'Not Found' };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
```
- Keep handler functions small — business logic in shared modules
- Connect to DB outside handler (connection reuse across invocations)
- Set `reservedConcurrency` to prevent runaway scaling
- Use Lambda Layers for shared dependencies (reduces deployment size)

## Cold Start Optimization
| Strategy | Improvement |
|----------|-------------|
| Use smaller languages (Node > Python > Java/C#) | 50-80% faster |
| Keep deployment package < 3MB | Faster download |
| Initialize SDK clients outside handler | Reuse connections |
| Provisioned Concurrency (AWS) | Zero cold starts (costs more) |
| SnapStart (Java) | 90% cold start reduction |
| Use AWS Graviton (arm64) | 20-30% faster, 20% cheaper |

## Cloudflare Workers
```javascript
// Edge worker — runs globally in <5ms cold start
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      const cache = caches.default;
      const cached = await cache.match(request);
      if (cached) return cached;

      const response = await fetch(new Request('https://api.example.com' + url.pathname, request));
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'public, max-age=300');
      const cachedResponse = new Response(response.body, { status: response.status, headers });
      ctx.waitUntil(cache.put(request, cachedResponse.clone()));
      return cachedResponse;
    }
    return env.ASSETS.fetch(request);
  },
};
```

## Vercel Functions
```javascript
// /api/users.js — automatically deployed as serverless function
export default async function handler(req, res) {
  const { method, query, body } = req;

  if (method === 'GET') {
    const users = await getUsers({ page: query.page, limit: query.limit });
    return res.json(users);
  }
  if (method === 'POST') {
    const user = await createUser(body);
    return res.status(201).json(user);
  }
  return res.status(405).json({ error: 'Method not allowed' });
}
```

## Function Orchestration
- Step Functions (AWS): state machine for multi-step workflows
- Durable Functions (Azure): stateful serverless workflows
- Choreography: services react to events independently
- Orchestration: central coordinator manages workflow (Step Functions)

## Event-Driven Architecture
```javascript
// Lambda triggered by S3 event
export const handler = async (event) => {
  for (const record of event.Records) {
    const { bucket, object } = record.s3;
    const image = await s3.getObject({ Bucket: bucket.name, Key: object.key }).promise();
    const resized = await sharp(image.Body).resize(200, 200).toBuffer();
    await s3.putObject({ Bucket: process.env.THUMBS_BUCKET, Key: object.key, Body: resized }).promise();
  }
};
```

## Performance & Monitoring
- Set memory appropriately: more memory = more CPU (Lambda)
- Monitor: execution duration, invocation count, error rate, throttle count
- Use Application Signals (AWS X-Ray, Datadog) for distributed tracing
- Logs: structured JSON with requestId, duration, memoryUsed
- Alerts on: error rate >1%, duration >p99, throttles >0

## Cost Optimization
- Lambda pricing: per request + duration (GB-seconds)
- Free tier: 1M requests/month, 400K GB-seconds
- Edge functions often cheaper than regional serverless
- Use reserved concurrency to avoid runaway costs
- Set function timeout — don't pay for hung functions

## Common Mistakes
- ❌ Cold start sensitive code in critical user paths (use provisioned concurrency)
- ❌ Lambda functions >30 seconds (use Step Functions or async processing)
- ❌ Not handling idempotency for retried invocations
- ❌ Exceeding Lambda payload limits (6MB sync, 256KB async)
- ❌ No dead-letter queue for failed async invocations
