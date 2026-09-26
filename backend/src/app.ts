import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './modules/auth/auth.routes';
import inventoryRoutes from './modules/inventory/inventory.routes';
import borrowRoutes from './modules/borrow/borrow.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import { dbRead, dbWrite } from './config/database';
import { buildHealthPayload } from './config/healthMonitor';
import { authenticateToken, requireAdmin } from './middleware/auth.middleware';
import { generalLimiter } from './middleware/rateLimit';
dotenv.config();

export const supabase = dbWrite;

const app = express();

// Trust reverse proxy (Render, Cloudflare, etc.) so req.ip and express-rate-limit read real client IP
app.set('trust proxy', 1);

// Cybersecurity Hardening: Suppress Express fingerprinting
app.disable('x-powered-by');

// Strict HTTP Security Headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  next();
});

const configuredOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : [];

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://cicr-inventory.vercel.app',
  'https://cicr-inventory-backend.onrender.com',
  process.env.FRONTEND_URL,
  ...configuredOrigins
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    if (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*')) {
      return callback(null, true);
    }

    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

// Payload DOS Protection: limit JSON payload to 1mb
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// High-Performance HTTP Response Compression (Gzip / Brotli)
import compression from 'compression';
app.use(compression());

// High-Speed Root & API Status Route (Optimized for load balancers, health checks & load testing)
app.get(['/', '/api', '/api/'], (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=120');
  res.status(200).json({
    status: 'online',
    service: 'CICR Robotics Inventory System API',
    version: '2.14.5',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// Apply general rate limiter across API
app.use('/api', generalLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/items', inventoryRoutes);
app.use('/api/borrow', borrowRoutes);
app.use('/api', dashboardRoutes); // Exposes GET /api/stats and GET /api/audit

// Database/HA-aware health endpoint
app.get('/api/health', (req: Request, res: Response) => {
  const payload = buildHealthPayload();

  const statusCode =
    payload.status === 'healthy'
      ? 200
      : payload.status === 'degraded'
        ? 200
        : 503;

  res.status(statusCode).json(payload);
});

// SMTP diagnostics endpoint (M-5: admin-only — exposes network/config presence oracles)
app.get('/api/smtp-debug', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const net = await import('net');
  const dns = await import('dns');

  const testSocket = (
    host: string,
    port: number,
    timeoutMs = 4000
  ): Promise<{
    port: number;
    success: boolean;
    error?: string;
    timeMs: number;
  }> => {
    return new Promise((resolve) => {
      const start = Date.now();
      const socket = new net.Socket();
      let finished = false;

      const done = (success: boolean, error?: string) => {
        if (finished) return;

        finished = true;
        socket.destroy();

        resolve({
          port,
          success,
          error,
          timeMs: Date.now() - start,
        });
      };

      socket.setTimeout(timeoutMs);

      socket.once('connect', () => done(true));

      socket.once('timeout', () =>
        done(false, 'ETIMEDOUT (port blocked or no response)')
      );

      socket.once('error', (err: any) => done(false, err.message));

      socket.connect(port, host);
    });
  };

  const dnsLookup = (): Promise<any> => {
    return new Promise((resolve) => {
      dns.lookup('smtp.gmail.com', { all: true }, (err, addresses) => {
        resolve(err ? { error: err.message } : addresses);
      });
    });
  };

  try {
    const [tcp587, tcp465, addresses] = await Promise.all([
      testSocket('smtp.gmail.com', 587, 4000),
      testSocket('smtp.gmail.com', 465, 4000),
      dnsLookup(),
    ]);

    res.json({
      dns: addresses,
      tcp_587: tcp587,
      tcp_465: tcp465,
      smtp_user_set: Boolean(process.env.SMTP_USER),
      smtp_pass_set: Boolean(process.env.SMTP_PASS),
    });
  } catch (err: any) {
    res.status(500).json({
      error: err.message,
    });
  }
});

export { dbRead };
export default app;
