import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { supabase } from './supabase.js';
import type { TokenPurpose } from '@margo/shared';

interface TokenPayload {
  bookingId: string;
  purpose: TokenPurpose;
  iat: number;
  exp: number;
}

/**
 * Generate a signed JWT token for a booking action.
 */
export function generateToken(
  bookingId: string,
  purpose: TokenPurpose,
  expiresAt: Date,
): string {
  const now = Math.floor(Date.now() / 1000);
  const exp = Math.floor(expiresAt.getTime() / 1000);

  return jwt.sign(
    { bookingId, purpose, iat: now, exp } satisfies TokenPayload,
    config.jwtSecret,
  );
}

/**
 * Verify and decode a JWT token. Returns null if invalid/expired.
 */
export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * Validate a manager token against the booking record.
 * Returns the booking if valid, null otherwise.
 */
export async function validateManagerToken(token: string) {
  const payload = verifyToken(token);
  if (!payload || payload.purpose !== 'manager_action') return null;

  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', payload.bookingId)
    .eq('manager_token', token)
    .single();

  if (!booking) return null;

  // Check if token is expired in DB too
  if (booking.manager_token_expires_at && new Date(booking.manager_token_expires_at) < new Date()) {
    return null;
  }

  return booking;
}

/**
 * Validate a client token (confirmation or manage) against the booking record.
 * Returns the booking if valid, null otherwise.
 */
export async function validateClientToken(token: string) {
  const payload = verifyToken(token);
  if (!payload) return null;
  if (payload.purpose !== 'client_confirmation' && payload.purpose !== 'client_manage') return null;

  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', payload.bookingId)
    .eq('client_token', token)
    .single();

  if (!booking) return null;

  if (booking.client_token_expires_at && new Date(booking.client_token_expires_at) < new Date()) {
    return null;
  }

  return { booking, purpose: payload.purpose };
}

/**
 * Invalidate a manager token (set to null after use).
 */
export async function invalidateManagerToken(bookingId: string) {
  await supabase
    .from('bookings')
    .update({ manager_token: null, manager_token_expires_at: null })
    .eq('id', bookingId);
}

/**
 * Invalidate a client token (set to null after use).
 */
export async function invalidateClientToken(bookingId: string) {
  await supabase
    .from('bookings')
    .update({ client_token: null, client_token_expires_at: null })
    .eq('id', bookingId);
}
