const config = {
  port: parseInt(process.env.VOTING_SERVICE_PORT || '3001', 10),
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  jwtSecret: process.env.JWT_SECRET || 'ankiety-dev-jwt-secret-change-me',
};

module.exports = config;
