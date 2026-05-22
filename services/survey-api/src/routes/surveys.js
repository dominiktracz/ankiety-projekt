const { Router } = require('express');
const pool = require('../db');
const Redis = require('ioredis');
const config = require('../config');
const { authenticate, optionalAuth } = require('../middleware/authMiddleware');

const router = Router();
const redis = new Redis(config.redis);

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.title, s.description, s.is_active, s.created_at, s.updated_at,
              s.owner_id, u.username AS owner_username
       FROM surveys s
       LEFT JOIN users u ON s.owner_id = u.id
       ORDER BY s.created_at DESC`
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const surveyResult = await pool.query(
      `SELECT s.id, s.title, s.description, s.is_active, s.created_at, s.updated_at,
              s.owner_id, u.username AS owner_username
       FROM surveys s
       LEFT JOIN users u ON s.owner_id = u.id
       WHERE s.id = $1`,
      [id]
    );

    if (surveyResult.rows.length === 0) {
      const error = new Error('Survey not found');
      error.statusCode = 404;
      throw error;
    }

    const optionsResult = await pool.query(
      'SELECT id, text, display_order FROM options WHERE survey_id = $1 ORDER BY display_order',
      [id]
    );

    let userVote = null;
    if (req.user) {
      const voteResult = await pool.query(
        'SELECT option_id FROM votes WHERE survey_id = $1 AND voter_id = $2',
        [id, req.user.userId]
      );
      if (voteResult.rows.length > 0) {
        userVote = voteResult.rows[0].option_id;
      }
    }

    res.json({
      data: {
        ...surveyResult.rows[0],
        options: optionsResult.rows,
        user_vote: userVote,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { title, description, options } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      const error = new Error('Title is required');
      error.statusCode = 400;
      throw error;
    }

    if (!options || !Array.isArray(options) || options.length < 2) {
      const error = new Error('At least 2 options are required');
      error.statusCode = 400;
      throw error;
    }

    await client.query('BEGIN');

    const surveyResult = await client.query(
      'INSERT INTO surveys (title, description, owner_id) VALUES ($1, $2, $3) RETURNING *',
      [title.trim(), description || null, req.user.userId]
    );
    const survey = surveyResult.rows[0];

    const optionRows = [];
    for (let i = 0; i < options.length; i++) {
      const optionText = typeof options[i] === 'string' ? options[i] : options[i].text;
      if (!optionText || optionText.trim().length === 0) {
        const error = new Error(`Option ${i + 1} text is required`);
        error.statusCode = 400;
        throw error;
      }

      const optResult = await client.query(
        'INSERT INTO options (survey_id, text, display_order) VALUES ($1, $2, $3) RETURNING *',
        [survey.id, optionText.trim(), i]
      );
      optionRows.push(optResult.rows[0]);

      await client.query(
        'INSERT INTO vote_aggregates (survey_id, option_id, vote_count) VALUES ($1, $2, 0)',
        [survey.id, optResult.rows[0].id]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      data: {
        ...survey,
        owner_username: req.user.username,
        options: optionRows,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, is_active } = req.body;

    const survey = await pool.query('SELECT owner_id FROM surveys WHERE id = $1', [id]);
    if (survey.rows.length === 0) {
      const error = new Error('Survey not found');
      error.statusCode = 404;
      throw error;
    }

    const isOwner = survey.rows[0].owner_id === req.user.userId;
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      const error = new Error('Brak uprawnień do edycji tej ankiety');
      error.statusCode = 403;
      throw error;
    }

    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (title !== undefined) {
      fields.push(`title = $${paramIndex++}`);
      values.push(title.trim());
    }
    if (description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (is_active !== undefined) {
      fields.push(`is_active = $${paramIndex++}`);
      values.push(is_active);
    }

    if (fields.length === 0) {
      const error = new Error('No fields to update');
      error.statusCode = 400;
      throw error;
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE surveys SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    await redis.del(`survey:${id}:results`);

    res.json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const survey = await pool.query('SELECT owner_id FROM surveys WHERE id = $1', [id]);
    if (survey.rows.length === 0) {
      const error = new Error('Survey not found');
      error.statusCode = 404;
      throw error;
    }

    const isOwner = survey.rows[0].owner_id === req.user.userId;
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      const error = new Error('Brak uprawnień do usunięcia tej ankiety');
      error.statusCode = 403;
      throw error;
    }

    await pool.query('DELETE FROM surveys WHERE id = $1', [id]);

    await redis.del(`survey:${id}:results`);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.get('/:id/results', async (req, res, next) => {
  try {
    const { id } = req.params;

    const cached = await redis.get(`survey:${id}:results`);
    if (cached) {
      return res.json({
        data: JSON.parse(cached),
        source: 'cache',
      });
    }

    const surveyResult = await pool.query(
      'SELECT id, title FROM surveys WHERE id = $1',
      [id]
    );

    if (surveyResult.rows.length === 0) {
      const error = new Error('Survey not found');
      error.statusCode = 404;
      throw error;
    }

    const aggregateResult = await pool.query(
      `SELECT o.id AS option_id, o.text AS option_text, 
              COALESCE(va.vote_count, 0) AS vote_count
       FROM options o
       LEFT JOIN vote_aggregates va ON o.id = va.option_id AND o.survey_id = va.survey_id
       WHERE o.survey_id = $1
       ORDER BY o.display_order`,
      [id]
    );

    const totalVotes = aggregateResult.rows.reduce(
      (sum, row) => sum + parseInt(row.vote_count),
      0
    );

    const results = {
      survey_id: id,
      title: surveyResult.rows[0].title,
      total_votes: totalVotes,
      options: aggregateResult.rows.map((row) => ({
        option_id: row.option_id,
        text: row.option_text,
        vote_count: parseInt(row.vote_count),
        percentage: totalVotes > 0
          ? Math.round((parseInt(row.vote_count) / totalVotes) * 10000) / 100
          : 0,
      })),
    };

    await redis.setex(`survey:${id}:results`, 60, JSON.stringify(results));

    res.json({ data: results, source: 'database' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
