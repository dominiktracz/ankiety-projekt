const config = {
  port: parseInt(process.env.WEBSOCKET_PORT || '3002', 10),
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  heartbeat: {
    intervalMs: 30000,
    timeoutMs: 10000,
  },
  jwtSecret: process.env.JWT_SECRET || 'ankiety-dev-jwt-secret-change-me',
  authTimeoutMs: 10000,
};

module.exports = config;
