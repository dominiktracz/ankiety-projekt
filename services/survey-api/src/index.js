const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');
const config = require('./config');
const pool = require('./db');
const authRoutes = require('./routes/auth');
const surveyRoutes = require('./routes/surveys');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'survey-api', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/surveys', surveyRoutes);

app.use(errorHandler);

async function seedAdmin() {
  try {
    const existing = await pool.query(
      "SELECT id FROM users WHERE email = 'admin@ankiety.pl'"
    );
    if (existing.rows.length === 0) {
      const hash = await bcrypt.hash('admin123', 10);
      await pool.query(
        `INSERT INTO users (username, email, password_hash, role)
         VALUES ('admin', 'admin@ankiety.pl', $1, 'admin')
         ON CONFLICT (email) DO NOTHING`,
        [hash]
      );
      console.log('[Survey API] Admin account seeded (admin@ankiety.pl / admin123)');
    } else {
      console.log('[Survey API] Admin account already exists');
    }
  } catch (err) {
    console.error('[Survey API] Error seeding admin:', err.message);
  }
}

app.listen(config.port, '0.0.0.0', async () => {
  console.log(`[Survey API] Running on port ${config.port}`);
  await seedAdmin();
});

process.on('SIGTERM', () => {
  console.log('[Survey API] SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Survey API] SIGINT received, shutting down...');
  process.exit(0);
});

module.exports = app;
