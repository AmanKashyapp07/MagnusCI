const logger = require('../utils/logger');

/**
 * Global Enterprise Error Handler Middleware
 */
const errorHandler = (err, req, res, _next) => {
  logger.error(`Unhandled Request Error at ${req.method} ${req.originalUrl}: ${err.message}`, err);

  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;
