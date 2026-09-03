const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
require('dotenv').config();

const connectDB = require('./config/db');
const { initSocket } = require('./socket/socket');
const apiRoutes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorMiddleware');
const logger = require('./utils/logger');

const app = express();
const server = http.createServer(app);

// Trust proxy for HTTPS load balancers on cloud hosts (Render, Railway, Heroku, Vercel)
app.set('trust proxy', 1);

// Security: disable fingerprinting header
app.disable('x-powered-by');

// Configure dynamic CORS origins safely
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((url) => url.trim());

app.use(cors({
  origin: (origin, callback) => {
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      (typeof origin === 'string' && origin.endsWith('.vercel.app')) ||
      (typeof origin === 'string' && (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')))
    ) {
      callback(null, true);
    } else {
      callback(new Error(`[CORS Error] Request from origin ${origin} blocked.`));
    }
  },
  credentials: true
}));

// Security Headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com', 'https://api.dicebear.com', 'https://images.unsplash.com'],
      mediaSrc: ["'self'", 'blob:', 'https://res.cloudinary.com'],
      connectSrc: ["'self'", 'wss:', 'ws:'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
      scriptSrc: ["'self'", "'unsafe-inline'"]
    }
  }
}));

// Response compression (gzip)
app.use(compression());

// Body parsing middleware with size limits (protects against payload abuse)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ─── Rate Limiting ──────────────────────────────────────────────────────────
// Global API limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Too many requests from this IP, please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

// Stricter limiter for auth endpoints (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50, // 50 auth attempts per 15 min per IP
  message: 'Too many login/register attempts. Please try again after 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth', authLimiter);

// Upload limiter (larger allowance — file uploads are heavy)
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 200,
  message: 'Too many uploads. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/upload', uploadLimiter);

// Serve static uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '7d',
  immutable: false,
  index: false
}));

const callRoutes = require('./routes/callRoutes');
const { cleanupInactiveCallSessions } = require('./controllers/callSessionController');

// Stricter limiter for call sessions & SFU tokens (prevents token exhaustion / call spamming)
const callLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30, // 30 call token/history requests per min per IP
  message: { success: false, message: 'Too many call requests. Please wait a moment.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// API Routes
app.use('/api', apiRoutes);
app.use('/api/calls', callLimiter, callRoutes);

// Periodic cleanup of abandoned or inactive call sessions (every 10 minutes)
setInterval(() => {
  cleanupInactiveCallSessions().catch(() => {});
}, 10 * 60 * 1000);

// 404 for unknown API routes (must be before the error handler)
app.use('/api', notFoundHandler);

// Error Middleware
app.use(errorHandler);

// Initialize Socket.io
initSocket(server);

// Start Server & Connect Database
const PORT = process.env.PORT || 5000;
let isShuttingDown = false;

server.listen(PORT, () => {
  logger.info(`[Server] ChatRoom Backend running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
  connectDB();
});

// Graceful shutdown for production (SIGTERM from PM2/Docker/k8s, SIGINT from Ctrl+C)
const shutdown = (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.warn(`[Server] ${signal} received — shutting down gracefully...`);

  server.close(() => {
    logger.info('[Server] HTTP server closed.');
    // Let mongoose close connections
    const mongoose = require('mongoose');
    mongoose.connection.close(false, () => {
      logger.info('[Server] MongoDB connection closed. Bye.');
      process.exit(0);
    });
    // Safety net: force exit if connections hang
    setTimeout(() => process.exit(0), 5000).unref();
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Unhandled rejection / exception guards (log, don't crash silently)
process.on('unhandledRejection', (reason) => {
  logger.error(`[Server] Unhandled Rejection: ${reason instanceof Error ? reason.stack : reason}`);
});
process.on('uncaughtException', (err) => {
  logger.error(`[Server] Uncaught Exception: ${err.stack}`);
  shutdown('uncaughtException');
});
