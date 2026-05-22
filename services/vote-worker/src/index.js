const { Pool } = require('pg');
const Redis = require('ioredis');
const config = require('./config');
const VoteProcessor = require('./processor');
const VoteAggregator = require('./aggregator');

const pool = new Pool(config.postgres);
const redis = new Redis(config.redis);

pool.on('error', (err) => console.error('[Worker] PostgreSQL pool error:', err.message));
redis.on('connect', () => console.log('[Worker] Connected to Redis'));
redis.on('error', (err) => console.error('[Worker] Redis error:', err.message));

const processor = new VoteProcessor(redis, pool, config);
const aggregator = new VoteAggregator(redis, pool);

let isRunning = true;
let isProcessing = false;

async function processLoop() {
  console.log(
    `[Worker] Starting processing loop (batch: ${config.worker.batchSize}, ` +
    `interval: ${config.worker.intervalMs}ms)`
  );

  while (isRunning) {
    if (!isProcessing) {
      isProcessing = true;

      try {
        const bufferLength = await redis.llen('votes:buffer');

        if (bufferLength > 0) {
          console.log(`[Worker] Buffer length: ${bufferLength} votes waiting`);

          const processedCount = await processor.processBatch();

          if (processedCount > 0) {
            const recentVotes = await pool.query(
              `SELECT DISTINCT survey_id FROM votes
               WHERE created_at > NOW() - INTERVAL '1 minute'`
            );

            const surveyIds = new Set(recentVotes.rows.map((r) => r.survey_id));
            await aggregator.aggregateAll(surveyIds);
          }
        }
      } catch (err) {
        console.error('[Worker] Processing error:', err.message);
      } finally {
        isProcessing = false;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, config.worker.intervalMs));
  }
}

const statsInterval = setInterval(() => {
  const stats = processor.getStats();
  console.log(
    `[Worker] Stats: ${stats.processed} processed, ` +
    `${stats.batches} batches, ${stats.errors} errors`
  );
}, 60000);

async function shutdown(signal) {
  console.log(`[Worker] ${signal} received, shutting down gracefully...`);
  isRunning = false;
  clearInterval(statsInterval);

  while (isProcessing) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  await redis.quit();
  await pool.end();
  console.log('[Worker] Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

console.log('[Vote Worker] Starting...');
processLoop().catch((err) => {
  console.error('[Worker] Fatal error:', err);
  process.exit(1);
});
