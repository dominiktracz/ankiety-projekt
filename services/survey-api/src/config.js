const config = {
  port: parseInt(process.env.SURVEY_API_PORT || '3000', 10),
  postgres: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'ankiety',
    user: process.env.POSTGRES_USER || 'ankiety_user',
    password: process.env.POSTGRES_PASSWORD || 'ankiety_secret_password',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  jwtSecret: process.env.JWT_SECRET || 'ankiety-dev-jwt-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
};

module.exports = config;
