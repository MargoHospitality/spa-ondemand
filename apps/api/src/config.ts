console.log('📋 Loading config...');
import 'dotenv/config';

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`❌ Missing required env var: ${key}`);
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  appUrl: process.env.APP_URL || 'http://localhost:3000',

  // Supabase
  supabaseUrl: required('SUPABASE_URL'),
  supabaseAnonKey: required('SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),

  // Stripe
  stripeSecretKey: required('STRIPE_SECRET_KEY'),
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',

  // Twilio
  twilioAccountSid: required('TWILIO_ACCOUNT_SID'),
  twilioAuthToken: required('TWILIO_AUTH_TOKEN'),
  twilioWhatsAppNumber: process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886',

  // Resend
  resendApiKey: required('RESEND_API_KEY'),
  emailFrom: process.env.EMAIL_FROM || 'Margo Spa <noreply@margohospitality.com>',

  // JWT
  jwtSecret: required('JWT_SECRET'),
} as const;
