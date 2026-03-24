import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

/** Service-role client for server-side operations (bypasses RLS) */
export const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey);

/** Anon client for operations that should respect RLS */
export const supabaseAnon = createClient(config.supabaseUrl, config.supabaseAnonKey);
