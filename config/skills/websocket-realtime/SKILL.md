# WebSocket & Real-Time Patterns

## WebSocket API (Native)
```javascript
// Client
const ws = new WebSocket('wss://api.example.com/ws');
ws.onopen = () => ws.send(JSON.stringify({ type: 'subscribe', channel: 'notifications' }));
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  handleMessage(data);
};
ws.onclose = () => {
  setTimeout(() => reconnect(), 1000);  // Reconnect with backoff
};
ws.onerror = (error) => console.error('WebSocket error:', error);

// Server (Node.js ws library)
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });
wss.on('connection', (ws, req) => {
  const userId = authenticate(req);  // Verify from connection headers
  ws.userId = userId;

  ws.on('message', (data) => {
    const message = JSON.parse(data);
    handleMessage(userId, message);
  });

  ws.on('close', () => cleanup(userId));
});
```
- Always implement reconnection with exponential backoff
- Heartbeat/ping-pong to detect stale connections
- Authenticate on connection, not on every message

## Socket.io
```javascript
// Server
const io = require('socket.io')(server, {
  cors: { origin: 'https://example.com' },
  pingInterval: 25000,
  pingTimeout: 20000,
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  const user = verifyToken(token);
  if (!user) return next(new Error('Authentication failed'));
  socket.user = user;
  next();
});

io.on('connection', (socket) => {
  // Join a room
  socket.join(`user:${socket.user.id}`);

  socket.on('message:send', (data) => {
    // Broadcast to room
    io.to(`chat:${data.chatId}`).emit('message:new', {
      userId: socket.user.id,
      content: data.content,
      timestamp: Date.now(),
    });
  });

  socket.on('disconnect', () => cleanup(socket));
});
```
- Rooms for broadcasting to groups of users
- Namespaces for logical separation (e.g., `/chat`, `/notifications`)
- `socket.join()` / `socket.leave()` for room management
- Acknowledge callbacks: `socket.emit('event', data, (ack) => console.log(ack))`

## Client (Socket.io)
```javascript
import { io } from 'socket.io-client';

const socket = io('https://api.example.com', {
  auth: { token: 'jwt-token' },
  transports: ['websocket'],  // Skip long-polling
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 30000,
});

socket.on('connect', () => console.log('Connected'));
socket.on('disconnect', (reason) => {
  if (reason === 'io server disconnect') socket.connect();  // Manual reconnect
});

// Join chat
socket.emit('join:room', { chatId: 'chat_123' });

// Listen
socket.on('message:new', ({ userId, content }) => appendMessage(userId, content));
```

## Server-Sent Events (SSE)
```javascript
// Server
app.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  const sendEvent = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  // Subscribe to event source
  const unsub = eventBus.on('notification', (notification) => {
    sendEvent(notification);
  });

  req.on('close', () => unsub());
});

// Client
const evtSource = new EventSource('/events');
evtSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  showNotification(data);
};
```
- SSE = unidirectional (server→client), simpler than WebSocket
- Built-in reconnection on the client
- Use for: notifications, feed updates, logs
- WebSocket for bidirectional communication (chat, collaboration)

## Scaling WebSockets
| Challenge | Solution |
|-----------|----------|
| Multiple server instances | Redis pub/sub for cross-instance messages |
| Sticky sessions | Load balancer IP hash or cookie-based routing |
| Stateful connections | Store socket IDs in Redis, map to user IDs |
| Rate limiting | Per-user/per-socket message rate tracking |
| Backpressure | Buffering + client acknowledgment protocol |

```javascript
// Cross-instance pub/sub with Redis
const adapter = require('@socket.io/redis-adapter');
const pubClient = redis.createClient();
const subClient = pubClient.duplicate();
io.adapter(adapter(pubClient, subClient));
// Now socket.io works across multiple server instances
```

## Presence & Status
- Track online/offline/idle per user
- Store last seen timestamp and status in Redis
- Broadcast presence changes to relevant rooms
- Handle disconnects (cleanup presence after timeout)
```javascript
socket.on('connection', () => {
  redis.set(`presence:${userId}`, 'online');
  io.to(`user:${userId}`).emit('presence', { userId, status: 'online' });
});
socket.on('disconnect', () => {
  redis.set(`presence:${userId}`, 'offline', 'EX', 300);
  io.to(`user:${userId}`).emit('presence', { userId, status: 'offline' });
});
```

## Common Mistakes
- ❌ Not implementing reconnection — single disconnect kills session
- ❌ No authentication on WebSocket upgrade (anyone can connect)
- ❌ Broadcasting to all clients instead of targeted rooms
- ❌ No message validation on server (trusting client data blindly)
- ❌ Missing heartbeats — zombie connections accumulate
