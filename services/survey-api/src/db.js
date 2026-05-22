const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool(config.postgres);

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL');
});

module.exports = pool;
