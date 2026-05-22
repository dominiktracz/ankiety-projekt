const jwt = require('jsonwebtoken');
const config = require('../config');

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Brak tokena autoryzacji. Zaloguj się.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Token wygasł. Zaloguj się ponownie.',
      });
    }
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Nieprawidłowy token.',
    });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Wymagane uprawnienia administratora.',
    });
  }
  next();
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role,
    };
  } catch {
    req.user = null;
  }

  next();
}

module.exports = { authenticate, requireAdmin, optionalAuth };
