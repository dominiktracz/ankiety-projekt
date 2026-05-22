const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/authMiddleware');

const router = Router();

module.exports = function createVoteRouter(redis) {
  router.post('/', authenticate, async (req, res, next) => {
    try {
      const { surveyId, optionId } = req.body;
      const voterId = req.user.userId;

      if (!surveyId || typeof surveyId !== 'string') {
        const error = new Error('surveyId is required');
        error.statusCode = 400;
        throw error;
      }

      if (!optionId || typeof optionId !== 'string') {
        const error = new Error('optionId is required');
        error.statusCode = 400;
        throw error;
      }

      const alreadyVoted = await redis.get(`voted:${surveyId}:${voterId}`);
      if (alreadyVoted) {
        const error = new Error('Już oddałeś głos w tej ankiecie');
        error.statusCode = 409;
        throw error;
      }

      const vote = {
        id: uuidv4(),
        surveyId,
        optionId,
        voterId,
        timestamp: new Date().toISOString(),
      };

      const pipeline = redis.pipeline();
      pipeline.lpush('votes:buffer', JSON.stringify(vote));
      pipeline.publish('votes:new', JSON.stringify({
        surveyId,
        optionId,
        voterId,
        timestamp: vote.timestamp,
      }));
      pipeline.setex(`voted:${surveyId}:${voterId}`, 604800, '1');
      await pipeline.exec();

      res.status(202).json({
        message: 'Vote accepted',
        data: { voteId: vote.id },
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
