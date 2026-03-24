import cron from 'node-cron';
import { checkManagerExpiration, checkManagerReminder } from './manager-expiration.js';
import { checkClientExpiration } from './client-expiration.js';
import { sendReminders } from './reminders.js';

/**
 * Register all cron jobs.
 */
export function startCronJobs() {
  // Every 5 minutes: check manager reminder + expiration
  cron.schedule('*/5 * * * *', async () => {
    console.log('[cron] Running manager checks...');
    await checkManagerReminder();
    await checkManagerExpiration();
  });

  // Every 5 minutes: check client expiration
  cron.schedule('*/5 * * * *', async () => {
    console.log('[cron] Running client expiration check...');
    await checkClientExpiration();
  });

  // Every 15 minutes: send reminders
  cron.schedule('*/15 * * * *', async () => {
    console.log('[cron] Running reminder check...');
    await sendReminders();
  });

  console.log('[cron] All cron jobs registered');
}
