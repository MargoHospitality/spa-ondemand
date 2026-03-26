import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { ACTIVE_STATUSES } from '@margo/shared';

export const publicRouter: ReturnType<typeof Router> = Router();

// ─── GET /api/properties/:slug — Get property by slug ───

publicRouter.get('/properties/:slug', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .eq('slug', req.params.slug)
      .eq('active', true)
      .single();

    if (error || !data) {
      res.status(404).json({ success: false, error: 'Property not found' });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/service-categories — Get categories for a property ───

publicRouter.get('/service-categories', async (req, res, next) => {
  try {
    const { property_id } = req.query;
    if (!property_id) {
      res.status(400).json({ success: false, error: 'property_id required' });
      return;
    }

    const { data, error } = await supabase
      .from('service_categories')
      .select('*')
      .eq('property_id', property_id as string)
      .eq('active', true)
      .order('display_order', { ascending: true });

    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/services — Get services for a property ───

publicRouter.get('/services', async (req, res, next) => {
  try {
    const { property_id } = req.query;
    if (!property_id) {
      res.status(400).json({ success: false, error: 'property_id required' });
      return;
    }

    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('property_id', property_id as string)
      .eq('active', true)
      .order('display_order', { ascending: true });

    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/closures — Get closures for a property ───

publicRouter.get('/closures', async (req, res, next) => {
  try {
    const { property_id } = req.query;
    if (!property_id) {
      res.status(400).json({ success: false, error: 'property_id required' });
      return;
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('closures')
      .select('*')
      .eq('property_id', property_id as string)
      .gte('end_at', now)
      .order('start_at', { ascending: true });

    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/bookings/check-duplicate — Check for duplicate active bookings ───

publicRouter.get('/bookings/check-duplicate', async (req, res, next) => {
  try {
    const { property_id, email, phone } = req.query;
    if (!property_id || (!email && !phone)) {
      res.json({ success: true, data: { hasDuplicate: false } });
      return;
    }

    let query = supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', property_id as string)
      .in('status', ACTIVE_STATUSES);

    if (email && phone) {
      query = query.or(`client_email.eq.${email},client_phone.eq.${phone}`);
    } else if (email) {
      query = query.eq('client_email', email as string);
    } else {
      query = query.eq('client_phone', phone as string);
    }

    const { count, error } = await query;
    if (error) throw error;

    res.json({ success: true, data: { hasDuplicate: (count || 0) > 0 } });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/captcha/verify — Verify reCAPTCHA token ───

publicRouter.post('/captcha/verify', async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) {
      res.json({ success: true, data: { success: true } }); // Skip if no captcha configured
      return;
    }

    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    if (!secretKey) {
      res.json({ success: true, data: { success: true } }); // Skip if no secret configured
      return;
    }

    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${secretKey}&response=${token}`,
    });

    const result = await response.json();
    res.json({ success: true, data: { success: result.success && result.score >= 0.5 } });
  } catch (err) {
    next(err);
  }
});
