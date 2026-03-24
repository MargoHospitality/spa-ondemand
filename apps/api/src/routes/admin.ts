import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

export const adminRouter: ReturnType<typeof Router> = Router();

// ─── Auth middleware: validates Supabase JWT and fetches user ───

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const token = authHeader.slice(7);
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

// ─── GET /api/admin/dashboard — Dashboard stats ───

adminRouter.get('/dashboard', async (req, res, next) => {
  try {
    const propertyId = req.query.property_id as string || (req as any).user.property_id;
    const now = new Date();

    // Today
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

    // Week
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    // Month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [todayRes, weekRes, monthRes, confirmedRes, declinedRes, noshowRes, responseTimesRes] = await Promise.all([
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('property_id', propertyId).gte('created_at', todayStart.toISOString()).lte('created_at', todayEnd.toISOString()),
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('property_id', propertyId).gte('created_at', weekStart.toISOString()),
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('property_id', propertyId).gte('created_at', monthStart.toISOString()),
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('property_id', propertyId).eq('status', 'CLIENT_CONFIRMED').gte('created_at', monthStart.toISOString()),
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('property_id', propertyId).in('status', ['MANAGER_DECLINED', 'CANCELLED_MANAGER']).gte('created_at', monthStart.toISOString()),
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('property_id', propertyId).eq('status', 'NO_SHOW').gte('created_at', monthStart.toISOString()),
      supabase.from('bookings').select('requested_at, manager_responded_at').eq('property_id', propertyId).not('manager_responded_at', 'is', null).gte('created_at', monthStart.toISOString()).limit(100),
    ]);

    // Calculate avg response time
    let avgResponseMinutes = 0;
    const responseTimes = responseTimesRes.data || [];
    if (responseTimes.length > 0) {
      const total = responseTimes.reduce((sum, b) => {
        if (!b.requested_at || !b.manager_responded_at) return sum;
        return sum + (new Date(b.manager_responded_at).getTime() - new Date(b.requested_at).getTime());
      }, 0);
      avgResponseMinutes = Math.round(total / responseTimes.length / 60000);
    }

    const today = todayRes.count || 0;
    const month = monthRes.count || 0;
    const confirmed = confirmedRes.count || 0;
    const confirmRate = month > 0 ? Math.round((confirmed / month) * 100) : 0;

    res.json({
      success: true,
      data: {
        today,
        week: weekRes.count || 0,
        month,
        confirmed,
        declined: declinedRes.count || 0,
        noshow: noshowRes.count || 0,
        avgResponseMinutes,
        confirmRate,
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
