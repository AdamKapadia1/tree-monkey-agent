/**
 * Cron: Daily dispatch
 * Runs at 06:00 every morning to generate and send driver routes.
 * node crons/dispatch.js
 */

import 'dotenv/config';
import cron from 'node-cron';
import { generateDailyDispatch } from '../tools/dispatch.js';

async function run() {
  const today = new Date().toISOString().split('T')[0];
  console.log(`[Dispatch cron] Running for ${today}`);
  const result = await generateDailyDispatch(today);
  console.log('[Dispatch cron] Complete:', result);
}

// Run immediately if called directly
if (process.argv[2] === '--now') {
  run().catch(console.error);
} else {
  // Schedule for 06:00 every day
  cron.schedule('0 6 * * *', () => {
    run().catch(console.error);
  }, { timezone: 'Europe/London' });
  console.log('[Dispatch cron] Scheduled for 06:00 daily (London time)');
}
