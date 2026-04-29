/**
 * Cron: Daily review fetch & processing
 * Runs at 08:00 every morning.
 * node crons/reviews.js
 */

import 'dotenv/config';
import cron from 'node-cron';
import { processNewReviews } from '../tools/reviews.js';
import { checkPermitExpiries } from '../tools/permit.js';

async function run() {
  console.log('[Reviews cron] Fetching and processing reviews...');
  const summary = await processNewReviews();
  console.log('[Reviews cron] Summary:', summary);

  console.log('[Permits cron] Checking permit expiries...');
  await checkPermitExpiries();
  console.log('[Permits cron] Done');
}

if (process.argv[2] === '--now') {
  run().catch(console.error);
} else {
  cron.schedule('0 8 * * *', () => {
    run().catch(console.error);
  }, { timezone: 'Europe/London' });
  console.log('[Reviews cron] Scheduled for 08:00 daily (London time)');
}
