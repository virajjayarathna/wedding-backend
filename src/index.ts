import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { config } from './config/env';
import { errorHandler } from './middleware/error.middleware';
import { startAdminExpiryJob } from './services/adminExpiry.service';

// Routes
import authRoutes from './routes/auth.routes';
import superAdminRoutes from './routes/superadmin.routes';
import adminRoutes from './routes/admin.routes';
import inviteRoutes from './routes/invite.routes';
import mediaRoutes from './routes/media.routes';

const app = express();
app.set('trust proxy', 1); // Trust first proxy (Nginx)

// ─────────────────────────────────────────
// Security Middleware
// ─────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman)
    if (!origin) return callback(null, true);
    if (config.cors.origins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS policy: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// Global rate limiter
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
}));

// ─────────────────────────────────────────
// Body Parsing
// ─────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─────────────────────────────────────────
// Health Check
// ─────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    success: true,
    service: 'wedding-backend',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  });
});

// ─────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────
app.use('/v1/auth', authRoutes);
app.use('/v1/superadmin', superAdminRoutes);
app.use('/v1/admin', adminRoutes);
app.use('/v1/invite', inviteRoutes);
app.use('/v1/media', mediaRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ─────────────────────────────────────────
// Global Error Handler
// ─────────────────────────────────────────
app.use(errorHandler);

// ─────────────────────────────────────────
// Start Server
// ─────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`\n🚀 Wedding Backend API running`);
  console.log(`   Environment : ${config.nodeEnv}`);
  console.log(`   Port        : ${config.port}`);
  console.log(`   Health      : http://localhost:${config.port}/health\n`);
  startAdminExpiryJob();
});

export default app;
