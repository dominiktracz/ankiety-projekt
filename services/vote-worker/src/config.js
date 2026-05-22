const config = {
  postgres: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'ankiety',
    user: process.env.POSTGRES_USER || 'ankiety_user',
    password: process.env.POSTGRES_PASSWORD || 'ankiety_secret_password',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  worker: {
    batchSize: parseInt(process.env.WORKER_BATCH_SIZE || '100', 10),
    intervalMs: parseInt(process.env.WORKER_INTERVAL_MS || '5000', 10),
  },
};

module.exports = config;
