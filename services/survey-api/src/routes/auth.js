const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const config = require('../config');
const { authenticate } = require('../middleware/authMiddleware');

const router = Router();

router.post('/register', async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      const error = new Error('Nazwa użytkownika musi mieć minimum 3 znaki');
      error.statusCode = 400;
      throw error;
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      const error = new Error('Podaj prawidłowy adres email');
      error.statusCode = 400;
      throw error;
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      const error = new Error('Hasło musi mieć minimum 6 znaków');
      error.statusCode = 400;
      throw error;
    }

    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email.toLowerCase().trim(), username.trim()]
    );

    if (existing.rows.length > 0) {
      const error = new Error('Użytkownik z takim emailem lub nazwą już istnieje');
      error.statusCode = 409;
      throw error;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, 'user')
       RETURNING id, username, email, role, created_at`,
      [username.trim(), email.toLowerCase().trim(), passwordHash]
    );

    const user = result.rows[0];

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    res.status(201).json({
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          created_at: user.created_at,
        },
        token,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      const error = new Error('Email i hasło są wymagane');
      error.statusCode = 400;
      throw error;
    }

    const result = await pool.query(
      'SELECT id, username, email, password_hash, role FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      const error = new Error('Nieprawidłowy email lub hasło');
      error.statusCode = 401;
      throw error;
    }

    const user = result.rows[0];

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      const error = new Error('Nieprawidłowy email lub hasło');
      error.statusCode = 401;
      throw error;
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    res.json({
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
        },
        token,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, role, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      const error = new Error('Użytkownik nie znaleziony');
      error.statusCode = 404;
      throw error;
    }

    res.json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
