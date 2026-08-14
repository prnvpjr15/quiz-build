const express = require('express');
const { generateQuiz } = require('../llmService');
const { saveQuiz, getQuiz, recordGeneration } = require('../db');
const { gradeQuiz } = require('../scoring');
const { generateLimiter, dailyBudget } = require('../middleware/limits');
const { GenerateQuizRequestSchema, SubmitAnswersRequestSchema } = require('../schema');

const router = express.Router();

function toPublicQuestion(question) {
  const { correctAnswerIndex, correctAnswer, explanation, ...publicFields } = question;
  return publicFields;
}

function toPublicQuiz(id, quiz) {
  return {
    quizId: id,
    title: quiz.title,
    topic: quiz.topic,
    difficulty: quiz.difficulty,
    questions: quiz.questions.map(toPublicQuestion),
  };
}

router.post('/generate', generateLimiter(), dailyBudget, async (req, res, next) => {
  try {
    const params = GenerateQuizRequestSchema.parse(req.body);
    const quiz = await generateQuiz(params);

    // Counted only after the model call succeeds: a failed generation costs
    // nothing and must not consume the daily budget.
    recordGeneration();

    const id = saveQuiz(quiz);
    res.status(201).json(toPublicQuiz(id, quiz));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', (req, res, next) => {
  try {
    const quiz = getQuiz(req.params.id);
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    res.json(toPublicQuiz(req.params.id, quiz));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/submit', async (req, res, next) => {
  try {
    const quiz = getQuiz(req.params.id);
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    const { answers } = SubmitAnswersRequestSchema.parse(req.body);
    const result = await gradeQuiz(quiz, answers);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
