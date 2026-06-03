import { Worker, Queue, Job } from 'bullmq';
import { config } from '../config';
import { emailService } from '../services/email';

export interface ImapSyncJob {
  triggeredAt: string;
}

const connection = { url: config.REDIS_URL };

const worker = new Worker<ImapSyncJob>(
  'imap-sync',
  async (job: Job<ImapSyncJob>) => {
    console.log(`[ImapSync] Starting IMAP sync triggered at ${job.data.triggeredAt}`);

    try {
      await emailService.startImapPolling();
      console.log('[ImapSync] IMAP poll completed');
      return { success: true, completedAt: new Date().toISOString() };
    } catch (err) {
      console.error('[ImapSync] IMAP poll failed:', (err as Error).message);
      throw err;
    }
  },
  {
    connection,
    concurrency: 1,
  }
);

export const imapSyncQueue = new Queue<ImapSyncJob>('imap-sync', { connection: { url: config.REDIS_URL } });

async function scheduleRecurring(): Promise<void> {
  // Remove old repeatable job if exists
  const repeatableJobs = await imapSyncQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === 'imap-poll') {
      await imapSyncQueue.removeRepeatableByKey(job.key);
    }
  }

  // Schedule every 120 seconds
  await imapSyncQueue.add(
    'imap-poll' as string & ImapSyncJob,
    { triggeredAt: new Date().toISOString() },
    {
      repeat: {
        every: 120_000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    }
  );

  console.log('[ImapSync] Scheduled IMAP polling every 120s');
}

worker.on('completed', (job) => {
  console.log(`[ImapSync] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[ImapSync] Job ${job?.id} failed:`, err.message);
});

worker.on('error', (err) => {
  console.error('[ImapSync] Worker error:', err.message);
});

// Start the recurring scheduler
scheduleRecurring().catch((err) => {
  console.error('[ImapSync] Failed to schedule recurring job:', err.message);
});

console.log('[ImapSync] imap-sync worker started');

export { worker };
