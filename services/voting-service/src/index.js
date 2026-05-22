const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const Redis = require('ioredis');
const config = require('./config');
const createVoteRouter = require('./routes/votes');

const app = express();
const redis = new Redis(config.redis);

redis.on('connect', () => console.log('[Voting Service] Connected to Redis'));
redis.on('error', (err) => console.error('[Voting Service] Redis error:', err.message));

app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    await redis.ping();
    res.json({ status: 'ok', service: 'voting-service', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: err.message });
  }
});

app.use('/api/votes', createVoteRouter(redis));

app.use((err, req, res, _next) => {
  console.error('Error:', err.message);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: err.name || 'Internal Server Error',
    message: err.message,
  });
});

app.listen(config.port, '0.0.0.0', () => {
  console.log(`[Voting Service] Running on port ${config.port}`);
});

process.on('SIGTERM', async () => {
  console.log('[Voting Service] SIGTERM received, shutting down...');
  await redis.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Voting Service] SIGINT received, shutting down...');
  await redis.quit();
  process.exit(0);
});

module.exports = app;
