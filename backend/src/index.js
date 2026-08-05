const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config/env');
const logger = require('./utils/logger');
const pool = require('./db');
const errorHandler = require('./middleware/errorHandler');

// Route Imports
const healthRoutes = require('./routes/health');
const repositoryRoutes = require('./routes/repositories');
const buildRoutes = require('./routes/builds');
const webhookRoutes = require('./routes/webhooks');
const authRoutes = require('./routes/auth');

const app = express();

// Security & Middleware
app.use(cors());

// Static artifact serving
app.use('/artifacts', express.static(path.join(__dirname, '../public/artifacts')));

// Configure JSON parser to preserve rawBody for timing-safe HMAC signature verification
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Route Mountings
app.use('/api/health', healthRoutes);
app.use('/api/repositories', repositoryRoutes);
app.use('/api/builds', buildRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/auth', authRoutes);

// Static frontend SPA serving
const frontendDistPath = path.join(__dirname, '../../frontend/dist');
const fallbackDistPath = path.join(__dirname, '../public/dist');
const distPath = require('fs').existsSync(frontendDistPath) ? frontendDistPath : fallbackDistPath;

app.use(express.static(distPath));

// SPA Client-side routing fallback
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io') || req.path.startsWith('/artifacts')) {
    return next();
  }
  const indexPath = path.join(distPath, 'index.html');
  if (require('fs').existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  next();
});

// Global Centralized Error Handler
app.use(errorHandler);

// Bootstrap Server & DB Check
const server = app.listen(config.PORT, () => {
  logger.info(`MagnusCI API Gateway active on http://localhost:${config.PORT}`);
  
  pool.query('SELECT NOW()')
    .then(result => {
      logger.info(`PostgreSQL Database connection verified. Server time: ${result.rows[0].now}`);
    })
    .catch(error => {
      logger.error('PostgreSQL Database connection failed:', error);
    });
});

// Socket.io + Redis Adapter Setup (Step 1 Implementation)
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

const io = new Server(server, {
  cors: { origin: '*' }
});

const pubClient = createClient({ url: `redis://${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || 6379}` });
const subClient = pubClient.duplicate();

Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
  io.adapter(createAdapter(pubClient, subClient));
  logger.info('⚡ Socket.io Redis adapter initialized for multi-pod scaling');
}).catch(err => {
  logger.error('Failed to initialize Redis Adapter for Socket.io:', err);
});

// Expose io instance to Express app
app.set('io', io);

// Graceful Shutdown Listener
const gracefulShutdown = (signal) => {
  logger.warn(`Received ${signal}. Initiating graceful gateway shutdown...`);
  server.close(() => {
    logger.info('HTTP Gateway Server closed.');
    pool.end(() => {
      logger.info('PostgreSQL Pool closed. Exiting process.');
      process.exit(0);
    });
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;
