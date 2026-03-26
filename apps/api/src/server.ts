console.log('🚀 Starting Margo Spa Booking API...');

import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { bookingsRouter } from './routes/bookings.js';
import { publicRouter } from './routes/public.js';
import { adminRouter } from './routes/admin.js';
import { webhooksRouter } from './routes/webhooks.js';
import { startCronJobs } from './jobs/index.js';

const app: ReturnType<typeof express> = express();

// ─── Stripe webhook needs raw body for signature verification ───
// Must be registered BEFORE express.json()

app.use('/webhooks/stripe', express.raw({ type: 'application/json' }), (req, _res, next) => {
  (req as express.Request & { rawBody: Buffer }).rawBody = req.body;
  next();
});

// ─── Middleware ───

// Allow multiple origins for CORS
const allowedOrigins = [
  config.appUrl,
  'https://spa.riad-elisa.com',
  'https://spaondemandgy87.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
];

app.use(cors({ 
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  }
}));
app.use(express.json());

// ─── Health check ───

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Routes ───

app.use('/api', publicRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/admin', adminRouter);
app.use('/webhooks', webhooksRouter);

// Manager/client token routes are nested under bookings router
// POST /api/bookings/manager/:token
// GET  /api/bookings/manager/:token
// POST /api/bookings/confirm/:token
// GET  /api/bookings/confirm/:token
// GET  /api/bookings/manage/:token
// POST /api/bookings/manage/:token/cancel
// POST /api/bookings/manage/:token/modify
// POST /api/bookings/manage/:token/reschedule-response
//
// Stripe webhook
// POST /webhooks/stripe

// ─── Error handler ───

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err.message);

  if (err.name === 'ZodError') {
    res.status(400).json({ success: false, error: 'Validation error', details: err });
    return;
  }

  res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

// ─── Start ───

app.listen(config.port, () => {
  console.log(`🧖 Margo Spa Booking API running on port ${config.port}`);
  startCronJobs();
});

export default app;
