const http = require('http');
const { WebSocketServer } = require('ws');
const Redis = require('ioredis');
const jwt = require('jsonwebtoken');
const config = require('./config');

const redisSub = new Redis(config.redis);
const redisClient = new Redis(config.redis);

redisSub.on('connect', () => console.log('[WS Server] Redis subscriber connected'));
redisSub.on('error', (err) => console.error('[WS Server] Redis sub error:', err.message));
redisClient.on('connect', () => console.log('[WS Server] Redis client connected'));

const server = http.createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'websocket-server',
      connections: wss.clients.size,
      timestamp: new Date().toISOString(),
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ server });

const subscriptions = new Map();

function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}

wss.on('connection', (ws, req) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log(`[WS Server] Client connected from ${clientIp}`);

  ws.isAlive = true;
  ws.isAuthenticated = false;
  ws.userId = null;
  ws.username = null;
  ws.userRole = null;
  ws.subscribedSurveys = new Set();

  const authTimeout = setTimeout(() => {
    if (!ws.isAuthenticated) {
      console.log(`[WS Server] Auth timeout for client ${clientIp}`);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Timeout autentykacji. Wyślij { type: "auth", token: "..." }',
      }));
      ws.close(4001, 'Auth timeout');
    }
  }, config.authTimeoutMs);

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());

      if (!ws.isAuthenticated) {
        if (message.type !== 'auth' || !message.token) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Wymagana autentykacja. Wyślij { type: "auth", token: "..." }',
          }));
          return;
        }

        const decoded = verifyToken(message.token);
        if (!decoded) {
          ws.send(JSON.stringify({ type: 'auth_error', message: 'Nieprawidłowy token' }));
          ws.close(4002, 'Invalid token');
          return;
        }

        clearTimeout(authTimeout);
        ws.isAuthenticated = true;
        ws.userId = decoded.userId;
        ws.username = decoded.username;
        ws.userRole = decoded.role;

        console.log(`[WS Server] Client authenticated: ${decoded.username} (${decoded.role})`);

        ws.send(JSON.stringify({
          type: 'authenticated',
          message: 'Autentykacja pomyślna',
          user: { username: decoded.username, role: decoded.role },
        }));
        return;
      }

      switch (message.type) {
        case 'subscribe': {
          const { surveyId } = message;
          if (!surveyId) {
            ws.send(JSON.stringify({ type: 'error', message: 'surveyId is required' }));
            return;
          }

          if (!subscriptions.has(surveyId)) {
            subscriptions.set(surveyId, new Set());
          }
          subscriptions.get(surveyId).add(ws);
          ws.subscribedSurveys.add(surveyId);

          console.log(
            `[WS Server] ${ws.username} subscribed to survey ${surveyId} ` +
            `(${subscriptions.get(surveyId).size} subscribers)`
          );

          const cached = await redisClient.get(`survey:${surveyId}:results`);
          if (cached) {
            ws.send(JSON.stringify({
              type: 'results',
              data: JSON.parse(cached),
            }));
          }

          ws.send(JSON.stringify({
            type: 'subscribed',
            surveyId,
            message: `Subscribed to survey ${surveyId}`,
          }));
          break;
        }

        case 'unsubscribe': {
          const { surveyId } = message;
          if (surveyId && subscriptions.has(surveyId)) {
            subscriptions.get(surveyId).delete(ws);
            ws.subscribedSurveys.delete(surveyId);

            if (subscriptions.get(surveyId).size === 0) {
              subscriptions.delete(surveyId);
            }

            ws.send(JSON.stringify({
              type: 'unsubscribed',
              surveyId,
            }));
          }
          break;
        }

        case 'ping': {
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
        }

        default: {
          ws.send(JSON.stringify({
            type: 'error',
            message: `Unknown message type: ${message.type}`,
          }));
        }
      }
    } catch (err) {
      console.error('[WS Server] Message parse error:', err.message);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid JSON message',
      }));
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimeout);
    console.log(`[WS Server] Client disconnected from ${clientIp}${ws.username ? ` (${ws.username})` : ''}`);
    for (const surveyId of ws.subscribedSurveys) {
      if (subscriptions.has(surveyId)) {
        subscriptions.get(surveyId).delete(ws);
        if (subscriptions.get(surveyId).size === 0) {
          subscriptions.delete(surveyId);
        }
      }
    }
  });

  ws.on('error', (err) => {
    console.error('[WS Server] WebSocket error:', err.message);
  });

  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Połączono z Ankiety WebSocket. Wyślij { type: "auth", token: "..." } aby się zalogować.',
    timestamp: new Date().toISOString(),
  }));
});

redisSub.subscribe('results:updated', 'votes:new', (err, count) => {
  if (err) {
    console.error('[WS Server] Redis subscribe error:', err.message);
    return;
  }
  console.log(`[WS Server] Subscribed to ${count} Redis channels`);
});

redisSub.on('message', (channel, message) => {
  try {
    const data = JSON.parse(message);

    if (channel === 'results:updated') {
      const { survey_id } = data;
      const subscribers = subscriptions.get(survey_id);

      if (subscribers && subscribers.size > 0) {
        const payload = JSON.stringify({
          type: 'results',
          data,
        });

        let sent = 0;
        for (const ws of subscribers) {
          if (ws.readyState === ws.OPEN && ws.isAuthenticated) {
            ws.send(payload);
            sent++;
          }
        }

        console.log(
          `[WS Server] Results update for survey ${survey_id} ` +
          `pushed to ${sent}/${subscribers.size} clients`
        );
      }
    }

    if (channel === 'votes:new') {
      const { surveyId } = data;
      const subscribers = subscriptions.get(surveyId);

      if (subscribers && subscribers.size > 0) {
        const payload = JSON.stringify({
          type: 'vote_received',
          data: { surveyId, timestamp: data.timestamp },
        });

        for (const ws of subscribers) {
          if (ws.readyState === ws.OPEN && ws.isAuthenticated) {
            ws.send(payload);
          }
        }
      }
    }
  } catch (err) {
    console.error('[WS Server] Message handling error:', err.message);
  }
});

const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log('[WS Server] Terminating inactive client');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, config.heartbeat.intervalMs);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

server.listen(config.port, '0.0.0.0', () => {
  console.log(`[WebSocket Server] Running on port ${config.port}`);
});

async function shutdown(signal) {
  console.log(`[WS Server] ${signal} received, shutting down...`);
  clearInterval(heartbeatInterval);

  wss.clients.forEach((ws) => {
    ws.send(JSON.stringify({ type: 'shutdown', message: 'Server shutting down' }));
    ws.close();
  });

  wss.close();
  await redisSub.quit();
  await redisClient.quit();
  server.close();
  console.log('[WS Server] Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
