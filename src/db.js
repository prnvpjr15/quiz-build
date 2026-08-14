const { randomUUID } = require('crypto');

// In-memory store. Swap this module for a Postgres/Mongo-backed one without
// touching routes — callers only depend on this function signature.
const quizzes = new Map();

function saveQuiz(quiz) {
  const id = randomUUID();
  quizzes.set(id, quiz);
  return id;
}

function getQuiz(id) {
  return quizzes.get(id);
}

module.exports = { saveQuiz, getQuiz };
