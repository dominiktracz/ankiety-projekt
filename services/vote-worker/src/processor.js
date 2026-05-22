class VoteProcessor {
  constructor(redis, pool, config) {
    this.redis = redis;
    this.pool = pool;
    this.batchSize = config.worker.batchSize;
    this.stats = { processed: 0, errors: 0, batches: 0 };
  }

  async processBatch() {
    const client = await this.pool.connect();

    try {
      const rawVotes = await this.redis.lrange('votes:buffer', 0, this.batchSize - 1);

      if (rawVotes.length === 0) {
        return 0;
      }

      await this.redis.ltrim('votes:buffer', rawVotes.length, -1);

      const votes = rawVotes.map((v) => {
        try {
          return JSON.parse(v);
        } catch (e) {
          console.error('[Processor] Invalid vote JSON:', v);
          return null;
        }
      }).filter(Boolean);

      if (votes.length === 0) {
        return 0;
      }

      await client.query('BEGIN');

      const insertValues = [];
      const insertParams = [];
      let paramIndex = 1;

      for (const vote of votes) {
        insertValues.push(
          `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
        );
        insertParams.push(
          vote.id,
          vote.surveyId,
          vote.optionId,
          vote.voterId,
          vote.timestamp
        );
      }

      const insertQuery = `
        INSERT INTO votes (id, survey_id, option_id, voter_id, created_at)
        VALUES ${insertValues.join(', ')}
        ON CONFLICT (survey_id, voter_id) DO NOTHING
        RETURNING survey_id, option_id
      `;

      const result = await client.query(insertQuery, insertParams);
      await client.query('COMMIT');

      const affectedSurveys = new Set();
      for (const row of result.rows) {
        affectedSurveys.add(row.survey_id);
      }

      this.stats.processed += result.rows.length;
      this.stats.batches++;

      console.log(
        `[Processor] Batch #${this.stats.batches}: ${result.rows.length}/${votes.length} votes inserted, ` +
        `${affectedSurveys.size} surveys affected`
      );

      return result.rows.length;
    } catch (err) {
      await client.query('ROLLBACK');
      this.stats.errors++;
      console.error('[Processor] Batch error:', err.message);
      throw err;
    } finally {
      client.release();
    }
  }

  getStats() {
    return { ...this.stats };
  }
}

module.exports = VoteProcessor;
