class VoteAggregator {
  constructor(redis, pool) {
    this.redis = redis;
    this.pool = pool;
  }

  async aggregateSurvey(surveyId) {
    try {
      const countResult = await this.pool.query(
        `SELECT option_id, COUNT(*) AS vote_count
         FROM votes
         WHERE survey_id = $1
         GROUP BY option_id`,
        [surveyId]
      );

      for (const row of countResult.rows) {
        await this.pool.query(
          `INSERT INTO vote_aggregates (survey_id, option_id, vote_count, last_updated)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (survey_id, option_id)
           DO UPDATE SET vote_count = $3, last_updated = NOW()`,
          [surveyId, row.option_id, parseInt(row.vote_count)]
        );
      }

      const resultsQuery = await this.pool.query(
        `SELECT s.id AS survey_id, s.title,
                o.id AS option_id, o.text AS option_text,
                COALESCE(va.vote_count, 0) AS vote_count
         FROM surveys s
         JOIN options o ON o.survey_id = s.id
         LEFT JOIN vote_aggregates va ON va.option_id = o.id AND va.survey_id = s.id
         WHERE s.id = $1
         ORDER BY o.display_order`,
        [surveyId]
      );

      if (resultsQuery.rows.length === 0) {
        return null;
      }

      const totalVotes = resultsQuery.rows.reduce(
        (sum, row) => sum + parseInt(row.vote_count),
        0
      );

      const results = {
        survey_id: surveyId,
        title: resultsQuery.rows[0].title,
        total_votes: totalVotes,
        options: resultsQuery.rows.map((row) => ({
          option_id: row.option_id,
          text: row.option_text,
          vote_count: parseInt(row.vote_count),
          percentage: totalVotes > 0
            ? Math.round((parseInt(row.vote_count) / totalVotes) * 10000) / 100
            : 0,
        })),
        updated_at: new Date().toISOString(),
      };

      await this.redis.setex(
        `survey:${surveyId}:results`,
        300,
        JSON.stringify(results)
      );

      await this.redis.publish(
        'results:updated',
        JSON.stringify(results)
      );

      console.log(
        `[Aggregator] Survey ${surveyId}: ${totalVotes} total votes, ` +
        `${results.options.length} options updated`
      );

      return results;
    } catch (err) {
      console.error(`[Aggregator] Error aggregating survey ${surveyId}:`, err.message);
      throw err;
    }
  }

  async aggregateAll(surveyIds) {
    const results = [];
    for (const surveyId of surveyIds) {
      const result = await this.aggregateSurvey(surveyId);
      if (result) results.push(result);
    }
    return results;
  }
}

module.exports = VoteAggregator;
