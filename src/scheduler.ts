import cron from 'node-cron';
import { sendAllReports } from './reports.js';

export function startScheduler(): void {
  // 10:00 AM ET daily
  cron.schedule('0 10 * * *', async () => {
    log('10:00 AM ET report triggered');
    try {
      await sendAllReports();
      log('10:00 AM reports complete');
    } catch (err) {
      log(`10:00 AM report error: ${err}`);
    }
  }, { timezone: 'America/New_York' });

  // 6:00 PM ET daily
  cron.schedule('0 18 * * *', async () => {
    log('6:00 PM ET report triggered');
    try {
      await sendAllReports();
      log('6:00 PM reports complete');
    } catch (err) {
      log(`6:00 PM report error: ${err}`);
    }
  }, { timezone: 'America/New_York' });

  log('Scheduled reports: 10:00 AM ET and 6:00 PM ET daily');
}

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] [Scheduler] ${msg}`);
}
