/**
 * Enterprise Structured Logger Utility
 * Provides standardized timestamped logging across gateway & worker daemons.
 */
const logger = {
  info: (msg, meta = {}) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [INFO] ${msg}`, Object.keys(meta).length ? meta : '');
  },
  warn: (msg, meta = {}) => {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] [WARN] ${msg}`, Object.keys(meta).length ? meta : '');
  },
  error: (msg, error = null) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [ERROR] ${msg}`, error ? (error.stack || error.message || error) : '');
  }
};

module.exports = logger;
