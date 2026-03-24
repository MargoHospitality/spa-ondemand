import { Router } from 'express';
import { z } from 'zod';
import {
  createBooking,
  handleManagerAction,
  handleClientConfirmation,
  handleClientRescheduleResponse,
  handleClientCancellation,
  handleModificationRequest,
} from '../services/booking-service.js';
import {
  validateManagerToken,
  validateClientToken,
  invalidateManagerToken,
  invalidateClientToken,
} from '../lib/tokens.js';
import { supabase } from '../lib/supabase.js';
import { CLIENT_SOURCES, isValidTransition } from '@margo/shared';

export const bookingsRouter: ReturnType<typeof Router> = Router();

// ─── Validation schemas ───

const createBookingSchema = z.object({
  property_id: z.string().uuid(),
  service_id: z.string().uuid(),
  client_name: z.string().min(1).max(200),
  client_email: z.string().email(),
  client_phone: z.string().min(5).max(30),
  client_locale: z.enum(['fr', 'en']),
  client_origin_property: z.string().max(200).optional(),
  client_source: z.enum(CLIENT_SOURCES).optional(),
  requested_slot: z.string().datetime(),
  client_message: z.string().max(1000).optional(),
});

const managerActionSchema = z.object({
  action: z.enum(['accept', 'reschedule', 'decline']),
  proposed_slot: z.string().datetime().optional(),
  reason: z.string().max(500).optional(),
}).refine(
  (data) => data.action !== 'reschedule' || data.proposed_slot,
  { message: 'proposed_slot is required for reschedule', path: ['proposed_slot'] },
);

// ─── POST /api/bookings — Create a new booking request ───

bookingsRouter.post('/', async (req, res, next) => {
  try {
    const input = createBookingSchema.parse(req.body);
    const booking = await createBooking(input);
    res.status(201).json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/bookings/:id — Get booking by ID (admin) ───

bookingsRouter.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('*, services(*), properties(name, slug)')
      .eq('id', req.params.id)
      .single();

    if (error || !data) {
      res.status(404).json({ success: false, error: 'Booking not found' });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/bookings — List bookings (admin, with filters) ───

bookingsRouter.get('/', async (req, res, next) => {
  try {
    const { property_id, status, from, to, limit = '50', offset = '0' } = req.query;

    let query = supabase
      .from('bookings')
      .select('*, services(name_fr, name_en, duration_minutes, price)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(parseInt(offset as string), parseInt(offset as string) + parseInt(limit as string) - 1);

    if (property_id) query = query.eq('property_id', property_id as string);
    if (status) query = query.eq('status', status as string);
    if (from) query = query.gte('requested_slot', from as string);
    if (to) query = query.lte('requested_slot', to as string);

    const { data, error, count } = await query;

    if (error) throw error;
    res.json({ success: true, data, count });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/manager/:token — Manager action (from WhatsApp link) ───

bookingsRouter.post('/manager/:token', async (req, res, next) => {
  try {
    const booking = await validateManagerToken(req.params.token);
    if (!booking) {
      res.status(401).json({ success: false, error: 'Invalid or expired token' });
      return;
    }

    const action = managerActionSchema.parse(req.body);
    const updated = await handleManagerAction(booking, action);
    await invalidateManagerToken(booking.id);

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/manager/:token — Get booking info for manager token page ───

bookingsRouter.get('/manager/:token', async (req, res, next) => {
  try {
    const booking = await validateManagerToken(req.params.token);
    if (!booking) {
      res.status(401).json({ success: false, error: 'Invalid or expired token' });
      return;
    }

    // Fetch service details
    const { data: service } = await supabase
      .from('services')
      .select('*')
      .eq('id', booking.service_id)
      .single();

    res.json({ success: true, data: { booking, service } });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/confirm/:token — Client confirms booking with payment ───

bookingsRouter.post('/confirm/:token', async (req, res, next) => {
  try {
    const result = await validateClientToken(req.params.token);
    if (!result || result.purpose !== 'client_confirmation') {
      res.status(401).json({ success: false, error: 'Invalid or expired token' });
      return;
    }

    const { stripe_payment_method_id } = z
      .object({ stripe_payment_method_id: z.string().min(1) })
      .parse(req.body);

    const updated = await handleClientConfirmation(result.booking, stripe_payment_method_id);
    // Token is replaced by manage token in handleClientConfirmation

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/confirm/:token — Get booking info for client confirmation page ───

bookingsRouter.get('/confirm/:token', async (req, res, next) => {
  try {
    const result = await validateClientToken(req.params.token);
    if (!result || result.purpose !== 'client_confirmation') {
      res.status(401).json({ success: false, error: 'Invalid or expired token' });
      return;
    }

    const { data: service } = await supabase
      .from('services')
      .select('*')
      .eq('id', result.booking.service_id)
      .single();

    res.json({
      success: true,
      data: {
        booking: {
          id: result.booking.id,
          client_name: result.booking.client_name,
          confirmed_slot: result.booking.confirmed_slot,
          requested_slot: result.booking.requested_slot,
          microtransaction_amount: result.booking.microtransaction_amount,
          status: result.booking.status,
        },
        service,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/manage/:token/reschedule-response — Client accepts/declines reschedule ───

bookingsRouter.post('/manage/:token/reschedule-response', async (req, res, next) => {
  try {
    const result = await validateClientToken(req.params.token);
    if (!result) {
      res.status(401).json({ success: false, error: 'Invalid or expired token' });
      return;
    }

    const { accept } = z.object({ accept: z.boolean() }).parse(req.body);
    const updated = await handleClientRescheduleResponse(result.booking, accept);

    if (!accept) {
      await invalidateClientToken(result.booking.id);
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/manage/:token — Get booking info for "Gérer mon soin" page ───

bookingsRouter.get('/manage/:token', async (req, res, next) => {
  try {
    const result = await validateClientToken(req.params.token);
    if (!result || result.purpose !== 'client_manage') {
      res.status(401).json({ success: false, error: 'Invalid or expired token' });
      return;
    }

    const { data: service } = await supabase
      .from('services')
      .select('*')
      .eq('id', result.booking.service_id)
      .single();

    const slotTime = new Date(result.booking.confirmed_slot || result.booking.requested_slot);
    const hoursUntilSlot = (slotTime.getTime() - Date.now()) / (1000 * 60 * 60);

    res.json({
      success: true,
      data: {
        booking: result.booking,
        service,
        can_modify: hoursUntilSlot > 24,
        can_cancel: true,
        free_cancellation: hoursUntilSlot > 24,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/manage/:token/cancel — Client cancels booking ───

bookingsRouter.post('/manage/:token/cancel', async (req, res, next) => {
  try {
    const result = await validateClientToken(req.params.token);
    if (!result || result.purpose !== 'client_manage') {
      res.status(401).json({ success: false, error: 'Invalid or expired token' });
      return;
    }

    const { reason } = z.object({ reason: z.string().max(500).optional() }).parse(req.body);
    const updated = await handleClientCancellation(result.booking, reason);

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/manage/:token/modify — Client requests modification ───

bookingsRouter.post('/manage/:token/modify', async (req, res, next) => {
  try {
    const result = await validateClientToken(req.params.token);
    if (!result || result.purpose !== 'client_manage') {
      res.status(401).json({ success: false, error: 'Invalid or expired token' });
      return;
    }

    const { requested_slot } = z
      .object({ requested_slot: z.string().datetime() })
      .parse(req.body);

    const updated = await handleModificationRequest(result.booking, requested_slot);

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/bookings/:id/status — Admin manual status update ───

bookingsRouter.patch('/:id/status', async (req, res, next) => {
  try {
    const { status } = z
      .object({ status: z.enum(['COMPLETED', 'NO_SHOW', 'CANCELLED_MANAGER']) })
      .parse(req.body);

    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !booking) {
      res.status(404).json({ success: false, error: 'Booking not found' });
      return;
    }

    if (!isValidTransition(booking.status, status)) {
      res.status(400).json({
        success: false,
        error: `Invalid transition: ${booking.status} → ${status}`,
      });
      return;
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { status, updated_at: now };

    if (status === 'COMPLETED') updates.completed_at = now;
    if (status === 'CANCELLED_MANAGER') {
      updates.cancelled_at = now;
      updates.cancellation_by = 'manager';
    }

    const { data, error } = await supabase
      .from('bookings')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});
