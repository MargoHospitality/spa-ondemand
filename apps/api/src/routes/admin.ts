import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import { generateToken } from '../lib/tokens.js';
import { handleManagerAction } from '../services/booking-service.js';
import { dispatchNotification } from '../services/notification-service.js';
import { isValidTransition, calculateClientDeadline, calculateManagerDeadline, type BookingStatus, type Booking } from '@margo/shared';

export const adminRouter: ReturnType<typeof Router> = Router();

// ─── Auth middleware: validates Supabase JWT and fetches user ───

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  // Support token via query param for file downloads (CSV export)
  const queryToken = req.query.token as string | undefined;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const token = bearerToken || queryToken;

  if (!token) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  // Create a per-request client with the user's token to verify auth
  const userClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error } = await userClient.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }

  // Fetch user record from our users table
  const { data: appUser } = await supabase
    .from('users')
    .select('*')
    .eq('auth_id', user.id)
    .eq('active', true)
    .single();

  if (!appUser) {
    res.status(403).json({ success: false, error: 'Access denied' });
    return;
  }

  (req as any).user = appUser;
  next();
}

adminRouter.use(requireAuth);

// ─── GET /api/admin/dashboard — Enhanced dashboard data ───

adminRouter.get('/dashboard', async (req, res, next) => {
  try {
    const propertyId = req.query.property_id as string || (req as any).user.property_id;
    const now = new Date();

    // Date boundaries
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
    weekStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const expiredCutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const [
      todaySoinsRes,
      toProcessRequestedRes,
      toProcessExpiredRes,
      toConfirmRealisationRes,
      caToday,
      caWeek,
      caMonth,
    ] = await Promise.all([
      // 1. Soins du jour: CLIENT_CONFIRMED with confirmed_slot today
      supabase.from('bookings')
        .select('id, client_name, confirmed_slot, guest_count, services(name_fr, name_en, price, duration_minutes)')
        .eq('property_id', propertyId)
        .eq('status', 'CLIENT_CONFIRMED')
        .gte('confirmed_slot', todayStart.toISOString())
        .lte('confirmed_slot', todayEnd.toISOString())
        .order('confirmed_slot', { ascending: true }),

      // 2a. A traiter: REQUESTED
      supabase.from('bookings')
        .select('id, client_name, requested_slot, guest_count, created_at, manager_token_expires_at, services(name_fr, name_en, price, duration_minutes)')
        .eq('property_id', propertyId)
        .eq('status', 'REQUESTED')
        .order('manager_token_expires_at', { ascending: true }),

      // 2b. A traiter: EXPIRED_CLIENT < 48h
      supabase.from('bookings')
        .select('id, client_name, requested_slot, confirmed_slot, guest_count, updated_at, services(name_fr, name_en, price, duration_minutes)')
        .eq('property_id', propertyId)
        .eq('status', 'EXPIRED_CLIENT')
        .gte('updated_at', expiredCutoff.toISOString())
        .order('updated_at', { ascending: false }),

      // 3. Realisation a confirmer: CLIENT_CONFIRMED with confirmed_slot < now
      supabase.from('bookings')
        .select('id, client_name, confirmed_slot, guest_count, services(name_fr, name_en, price, duration_minutes)')
        .eq('property_id', propertyId)
        .eq('status', 'CLIENT_CONFIRMED')
        .lt('confirmed_slot', now.toISOString())
        .order('confirmed_slot', { ascending: false }),

      // 4a. CA today (COMPLETED)
      supabase.from('bookings')
        .select('guest_count, services(price)')
        .eq('property_id', propertyId)
        .eq('status', 'COMPLETED')
        .gte('completed_at', todayStart.toISOString())
        .lte('completed_at', todayEnd.toISOString()),

      // 4b. CA week (COMPLETED)
      supabase.from('bookings')
        .select('guest_count, services(price)')
        .eq('property_id', propertyId)
        .eq('status', 'COMPLETED')
        .gte('completed_at', weekStart.toISOString()),

      // 4c. CA month (COMPLETED)
      supabase.from('bookings')
        .select('guest_count, services(price)')
        .eq('property_id', propertyId)
        .eq('status', 'COMPLETED')
        .gte('completed_at', monthStart.toISOString()),
    ]);

    function sumCA(rows: any[] | null): { total: number; count: number } {
      if (!rows) return { total: 0, count: 0 };
      return rows.reduce((acc, b) => ({
        total: acc.total + ((b.services as any)?.price || 0) * (b.guest_count || 1),
        count: acc.count + 1,
      }), { total: 0, count: 0 });
    }

    const financesToday = sumCA(caToday.data);
    const financesWeek = sumCA(caWeek.data);
    const financesMonth = sumCA(caMonth.data);

    res.json({
      success: true,
      data: {
        todaySoins: todaySoinsRes.data || [],
        toProcess: [
          ...(toProcessRequestedRes.data || []).map((b: any) => ({ ...b, _type: 'REQUESTED' })),
          ...(toProcessExpiredRes.data || []).map((b: any) => ({ ...b, _type: 'EXPIRED_CLIENT' })),
        ],
        toConfirmRealisation: toConfirmRealisationRes.data || [],
        finances: {
          today: financesToday,
          week: financesWeek,
          month: financesMonth,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Services CRUD ───

adminRouter.get('/services', async (req, res, next) => {
  try {
    const propertyId = req.query.property_id as string || (req as any).user.property_id;
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('property_id', propertyId)
      .order('display_order', { ascending: true });
    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/services', async (req, res, next) => {
  try {
    const body = z.object({
      property_id: z.string().uuid(),
      name_fr: z.string().min(1),
      name_en: z.string().min(1),
      description_fr: z.string().nullable().optional(),
      description_en: z.string().nullable().optional(),
      duration_minutes: z.number().int().positive(),
      price: z.number().int().min(0),
      display_order: z.number().int().optional(),
      active: z.boolean().optional(),
    }).parse(req.body);

    const { data, error } = await supabase.from('services').insert(body).select().single();
    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

adminRouter.put('/services/:id', async (req, res, next) => {
  try {
    const { property_id, ...body } = req.body;
    const { data, error } = await supabase
      .from('services')
      .update(body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/services/:id', async (req, res, next) => {
  try {
    const { error } = await supabase.from('services').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── Users CRUD ───

adminRouter.get('/users', async (req, res, next) => {
  try {
    const propertyId = req.query.property_id as string || (req as any).user.property_id;
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/users', async (req, res, next) => {
  try {
    const body = z.object({
      property_id: z.string().uuid(),
      name: z.string().min(1),
      email: z.string().email(),
      phone_whatsapp: z.string().nullable().optional(),
      role: z.enum(['manager', 'admin', 'superadmin']),
      password: z.string().min(6),
      active: z.boolean().optional(),
    }).parse(req.body);

    // Create Supabase Auth user
    const adminClient = createClient(config.supabaseUrl, config.supabaseServiceRoleKey);
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
    });
    if (authError) throw authError;

    // Create user record
    const { password, ...userFields } = body;
    const { data, error } = await supabase
      .from('users')
      .insert({ ...userFields, auth_id: authData.user.id })
      .select()
      .single();
    if (error) throw error;

    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

adminRouter.put('/users/:id', async (req, res, next) => {
  try {
    const { property_id, password, ...body } = req.body;

    // Update password if provided
    if (password) {
      const { data: user } = await supabase.from('users').select('auth_id').eq('id', req.params.id).single();
      if (user?.auth_id) {
        const adminClient = createClient(config.supabaseUrl, config.supabaseServiceRoleKey);
        await adminClient.auth.admin.updateUserById(user.auth_id, { password });
      }
    }

    const { data, error } = await supabase
      .from('users')
      .update(body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/users/:id', async (req, res, next) => {
  try {
    // Deactivate rather than hard-delete
    const { data, error } = await supabase
      .from('users')
      .update({ active: false })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ─── Property settings ───

adminRouter.get('/property/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('properties').select('*').eq('id', req.params.id).single();
    if (error || !data) {
      res.status(404).json({ success: false, error: 'Property not found' });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

adminRouter.put('/property/:id', async (req, res, next) => {
  try {
    const allowed = [
      'name', 'opening_time', 'closing_time',
      'manager_response_delay_minutes', 'manager_auto_fail_delay_minutes',
      'client_confirmation_delay_long', 'client_confirmation_delay_24h',
      'client_confirmation_delay_48h', 'microtransaction_amount',
      'primary_color', 'secondary_color', 'logo_url',
    ];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const { data, error } = await supabase
      .from('properties')
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

// ─── Closures CRUD ───

adminRouter.get('/closures', async (req, res, next) => {
  try {
    const propertyId = req.query.property_id as string || (req as any).user.property_id;
    const { data, error } = await supabase
      .from('closures')
      .select('*')
      .eq('property_id', propertyId)
      .order('start_at', { ascending: true });
    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/closures', async (req, res, next) => {
  try {
    const body = z.object({
      property_id: z.string().uuid(),
      label: z.string().min(1),
      start_at: z.string().datetime(),
      end_at: z.string().datetime(),
    }).parse(req.body);

    const { data, error } = await supabase
      .from('closures')
      .insert({ ...body, created_by: (req as any).user.id })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/closures/:id', async (req, res, next) => {
  try {
    const { error } = await supabase.from('closures').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── Admin booking actions ───

// POST /api/admin/bookings/:id/confirm — Manager confirms booking
adminRouter.post('/bookings/:id/confirm', async (req, res, next) => {
  try {
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings').select('*').eq('id', req.params.id).single();
    if (fetchErr || !booking) { res.status(404).json({ success: false, error: 'Booking not found' }); return; }

    const result = await handleManagerAction(booking as Booking, { action: 'accept' });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/bookings/:id/decline — Manager declines booking
adminRouter.post('/bookings/:id/decline', async (req, res, next) => {
  try {
    const { reason } = z.object({ reason: z.string().max(500).optional() }).parse(req.body);
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings').select('*').eq('id', req.params.id).single();
    if (fetchErr || !booking) { res.status(404).json({ success: false, error: 'Booking not found' }); return; }

    const result = await handleManagerAction(booking as Booking, { action: 'decline', reason });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/bookings/:id/reschedule — Manager proposes new slot
adminRouter.post('/bookings/:id/reschedule', async (req, res, next) => {
  try {
    const { proposed_slot } = z.object({ proposed_slot: z.string().datetime() }).parse(req.body);
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings').select('*').eq('id', req.params.id).single();
    if (fetchErr || !booking) { res.status(404).json({ success: false, error: 'Booking not found' }); return; }

    const result = await handleManagerAction(booking as Booking, { action: 'reschedule', proposed_slot });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/bookings/:id/cancel — Manager cancels confirmed booking
adminRouter.post('/bookings/:id/cancel', async (req, res, next) => {
  try {
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings').select('*').eq('id', req.params.id).single();
    if (fetchErr || !booking) { res.status(404).json({ success: false, error: 'Booking not found' }); return; }

    if (!isValidTransition(booking.status, 'CANCELLED_MANAGER')) {
      res.status(400).json({ success: false, error: `Invalid transition: ${booking.status} → CANCELLED_MANAGER` });
      return;
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase.from('bookings')
      .update({ status: 'CANCELLED_MANAGER', cancelled_at: now, cancellation_by: 'manager', updated_at: now })
      .eq('id', req.params.id).select().single();
    if (error) throw error;

    dispatchNotification({ eventType: 'cancellation_confirmed', bookingId: booking.id })
      .catch((err) => console.error('[admin] Failed to notify:', err));

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/bookings/:id/complete — Mark booking as completed
adminRouter.post('/bookings/:id/complete', async (req, res, next) => {
  try {
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings').select('*').eq('id', req.params.id).single();
    if (fetchErr || !booking) { res.status(404).json({ success: false, error: 'Booking not found' }); return; }

    if (!isValidTransition(booking.status, 'COMPLETED')) {
      res.status(400).json({ success: false, error: `Invalid transition: ${booking.status} → COMPLETED` });
      return;
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase.from('bookings')
      .update({ status: 'COMPLETED', completed_at: now, updated_at: now })
      .eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/bookings/:id/noshow — Mark booking as no-show
adminRouter.post('/bookings/:id/noshow', async (req, res, next) => {
  try {
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings').select('*').eq('id', req.params.id).single();
    if (fetchErr || !booking) { res.status(404).json({ success: false, error: 'Booking not found' }); return; }

    if (!isValidTransition(booking.status, 'NO_SHOW')) {
      res.status(400).json({ success: false, error: `Invalid transition: ${booking.status} → NO_SHOW` });
      return;
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase.from('bookings')
      .update({ status: 'NO_SHOW', updated_at: now })
      .eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/bookings/:id/resend — Resend notification to expired client
adminRouter.post('/bookings/:id/resend', async (req, res, next) => {
  try {
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings').select('*').eq('id', req.params.id).single();
    if (fetchErr || !booking) { res.status(404).json({ success: false, error: 'Booking not found' }); return; }

    if (booking.status !== 'EXPIRED_CLIENT') {
      res.status(400).json({ success: false, error: 'Only EXPIRED_CLIENT bookings can be resent' });
      return;
    }

    // Restore to MANAGER_CONFIRMED and regenerate client token
    const { data: property } = await supabase.from('properties').select('*').eq('id', booking.property_id).single();
    if (!property) { res.status(500).json({ success: false, error: 'Property not found' }); return; }

    const now = new Date();
    const slotTime = new Date(booking.confirmed_slot || booking.requested_slot);
    const clientDeadline = calculateClientDeadline(slotTime, now, {
      delayLongHours: property.client_confirmation_delay_long,
      delay24hHours: property.client_confirmation_delay_24h,
    });
    const clientToken = generateToken(booking.id, 'client_confirmation', clientDeadline);

    const { data, error } = await supabase.from('bookings')
      .update({
        status: 'MANAGER_CONFIRMED',
        client_token: clientToken,
        client_token_expires_at: clientDeadline.toISOString(),
        client_notified_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', req.params.id).select().single();
    if (error) throw error;

    // Re-notify client
    dispatchNotification({ eventType: 'manager_confirmed', bookingId: booking.id })
      .catch((err) => console.error('[admin] Failed to resend:', err));

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ─── Finances ───

// GET /api/admin/finances — Financial stats for a period
adminRouter.get('/finances', async (req, res, next) => {
  try {
    const propertyId = req.query.property_id as string || (req as any).user.property_id;
    const from = req.query.from as string;
    const to = req.query.to as string;

    if (!from || !to) {
      res.status(400).json({ success: false, error: 'from and to are required' });
      return;
    }

    const [completedRes, upcomingRes, noshowRes, cancelledRes] = await Promise.all([
      // Completed bookings in period
      supabase.from('bookings')
        .select('id, client_name, confirmed_slot, completed_at, guest_count, services(name_fr, name_en, price, duration_minutes)')
        .eq('property_id', propertyId)
        .eq('status', 'COMPLETED')
        .gte('completed_at', from)
        .lte('completed_at', to)
        .order('completed_at', { ascending: false }),

      // Upcoming confirmed (CA a venir)
      supabase.from('bookings')
        .select('guest_count, services(price)')
        .eq('property_id', propertyId)
        .eq('status', 'CLIENT_CONFIRMED')
        .gte('confirmed_slot', new Date().toISOString()),

      // No-shows in period
      supabase.from('bookings')
        .select('guest_count, services(price)')
        .eq('property_id', propertyId)
        .eq('status', 'NO_SHOW')
        .gte('updated_at', from)
        .lte('updated_at', to),

      // Cancellations in period
      supabase.from('bookings')
        .select('guest_count, services(price)')
        .eq('property_id', propertyId)
        .in('status', ['CANCELLED_CLIENT', 'CANCELLED_MANAGER'])
        .gte('cancelled_at', from)
        .lte('cancelled_at', to),
    ]);

    function sumRows(rows: any[] | null): { total: number; count: number } {
      if (!rows) return { total: 0, count: 0 };
      return rows.reduce((acc, b) => ({
        total: acc.total + ((b.services as any)?.price || 0) * (b.guest_count || 1),
        count: acc.count + 1,
      }), { total: 0, count: 0 });
    }

    const completed = sumRows(completedRes.data);
    const upcoming = sumRows(upcomingRes.data);
    const noshows = sumRows(noshowRes.data);
    const cancelled = sumRows(cancelledRes.data);
    const avgBasket = completed.count > 0 ? Math.round(completed.total / completed.count) : 0;

    res.json({
      success: true,
      data: {
        caRealise: completed,
        caAVenir: upcoming,
        panierMoyen: avgBasket,
        noshows,
        cancellations: cancelled,
        details: completedRes.data || [],
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/finances/export — CSV export
adminRouter.get('/finances/export', async (req, res, next) => {
  try {
    const propertyId = req.query.property_id as string || (req as any).user.property_id;
    const from = req.query.from as string;
    const to = req.query.to as string;

    if (!from || !to) {
      res.status(400).json({ success: false, error: 'from and to are required' });
      return;
    }

    const { data: rows } = await supabase.from('bookings')
      .select('id, client_name, confirmed_slot, completed_at, guest_count, status, services(name_fr, price, duration_minutes)')
      .eq('property_id', propertyId)
      .in('status', ['COMPLETED', 'NO_SHOW'])
      .gte('completed_at', from)
      .lte('completed_at', to)
      .order('completed_at', { ascending: false });

    const header = 'Date,Client,Prestation,Nb personnes,Prix unitaire (MAD),Total (MAD),Statut\n';
    const csvRows = (rows || []).map((r: any) => {
      const price = (r.services as any)?.price || 0;
      const total = price * (r.guest_count || 1);
      return [
        r.completed_at ? new Date(r.completed_at).toISOString().split('T')[0] : '',
        `"${(r.client_name || '').replace(/"/g, '""')}"`,
        `"${((r.services as any)?.name_fr || '').replace(/"/g, '""')}"`,
        r.guest_count || 1,
        (price / 100).toFixed(2),
        (total / 100).toFixed(2),
        r.status,
      ].join(',');
    });

    const csv = header + csvRows.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=finances-${from.split('T')[0]}-${to.split('T')[0]}.csv`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

// ─── Bookings list with counters for pills ───

adminRouter.get('/bookings/counts', async (req, res, next) => {
  try {
    const propertyId = req.query.property_id as string || (req as any).user.property_id;
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    const expiredCutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const [toProcessReq, toProcessExp, todayRes, confirmedRes, allRes] = await Promise.all([
      supabase.from('bookings').select('id', { count: 'exact', head: true })
        .eq('property_id', propertyId).eq('status', 'REQUESTED'),
      supabase.from('bookings').select('id', { count: 'exact', head: true })
        .eq('property_id', propertyId).eq('status', 'EXPIRED_CLIENT')
        .gte('updated_at', expiredCutoff.toISOString()),
      supabase.from('bookings').select('id', { count: 'exact', head: true })
        .eq('property_id', propertyId).eq('status', 'CLIENT_CONFIRMED')
        .gte('confirmed_slot', todayStart.toISOString())
        .lte('confirmed_slot', todayEnd.toISOString()),
      supabase.from('bookings').select('id', { count: 'exact', head: true })
        .eq('property_id', propertyId).eq('status', 'CLIENT_CONFIRMED'),
      supabase.from('bookings').select('id', { count: 'exact', head: true })
        .eq('property_id', propertyId),
    ]);

    res.json({
      success: true,
      data: {
        toProcess: (toProcessReq.count || 0) + (toProcessExp.count || 0),
        today: todayRes.count || 0,
        confirmed: confirmedRes.count || 0,
        all: allRes.count || 0,
      },
    });
  } catch (err) {
    next(err);
  }
});
