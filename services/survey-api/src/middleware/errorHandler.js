function errorHandler(err, req, res, next) {
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);

  if (err.code === '23505') {
    return res.status(409).json({
      error: 'Conflict',
      message: 'Resource already exists or duplicate entry',
    });
  }

  if (err.code === '23503') {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Referenced resource does not exist',
    });
  }

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: err.name || 'Internal Server Error',
    message: err.message || 'An unexpected error occurred',
  });
}

module.exports = errorHandler;
