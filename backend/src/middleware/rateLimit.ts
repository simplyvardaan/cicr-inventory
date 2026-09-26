// Rate limiting middleware (v2.1.0).
//
// Protects sensitive endpoints from brute-force attacks:
// - Auth endpoints (login, OTP): 10 requests per 15 minutes per IP
// - General API: 100 requests per 15 minutes per IP
// - Admin endpoints: 30 requests per 15 minutes per IP
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

function safeKeyGenerator(req: any): string {
  return ipKeyGenerator(req);
}

// ---------------------------------------------------------------- general API
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1500, // 1500 requests per 15m (100 req/min) to comfortably support concurrent load bursts and campus NAT IPs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many requests. Please try again later.',
  },
  keyGenerator: safeKeyGenerator,
  skip: (req) => {
    // Inventory GET requests have dedicated high-throughput itemsReadLimiter
    const url = req.originalUrl || req.url || '';
    return req.method === 'GET' && (url.startsWith('/api/items') || url.startsWith('/api/health') || url === '/' || url === '/api' || url === '/api/');
  },
});

// ---------------------------------------------------------------- inventory items catalog rate limiter (high throughput)
export const itemsReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30000, // 30,000 requests per 15m (~2,000 req/min), effortlessly absorbs load tests and sustained bursts up to 50-100 req/sec
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many inventory requests. Please slow down.',
  },
  keyGenerator: safeKeyGenerator,
});

// ---------------------------------------------------------------- auth endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many authentication attempts. Please try again after 15 minutes.',
  },
  keyGenerator: safeKeyGenerator,
});

// ---------------------------------------------------------------- OTP endpoints (stricter)
export const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many OTP requests. Please wait before requesting a new code.',
  },
  keyGenerator: safeKeyGenerator,
});

// ---------------------------------------------------------------- admin endpoints
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many admin requests. Please try again later.',
  },
  keyGenerator: safeKeyGenerator,
});

// ---------------------------------------------------------------- registration (very strict)
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many registration attempts. Please try again after 1 hour.',
  },
  keyGenerator: safeKeyGenerator,
});
