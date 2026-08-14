process.env.DB_PATH = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  saveQuiz,
  getQuiz,
  countQuizzes,
  recordGeneration,
  generationsToday,
} = require('../src/db');
const { validQuiz } = require('./helpers');

test('saveQuiz returns an id that getQuiz round-trips', () => {
  const id = saveQuiz(validQuiz);

  assert.equal(typeof id, 'string');
  assert.deepEqual(getQuiz(id), validQuiz);
});

test('stored quizzes keep answers and question ids intact', () => {
  const withIds = {
    ...validQuiz,
    questions: validQuiz.questions.map((q, i) => ({ id: `q-${i}`, ...q })),
  };

  const stored = getQuiz(saveQuiz(withIds));

  assert.deepEqual(stored.questions.map((q) => q.id), ['q-0', 'q-1', 'q-2']);
  assert.equal(stored.questions[0].correctAnswerIndex, 1);
  assert.equal(stored.questions[1].correctAnswer, true);
});

test('getQuiz returns undefined for an unknown id', () => {
  assert.equal(getQuiz('does-not-exist'), undefined);
});

test('each save gets a distinct id', () => {
  const ids = new Set([saveQuiz(validQuiz), saveQuiz(validQuiz), saveQuiz(validQuiz)]);
  assert.equal(ids.size, 3);
});

test('countQuizzes reflects what has been stored', () => {
  const before = countQuizzes();
  saveQuiz(validQuiz);

  assert.equal(countQuizzes(), before + 1);
});

test('generation counter starts at zero and increments', () => {
  const before = generationsToday();

  recordGeneration();
  recordGeneration();

  assert.equal(generationsToday(), before + 2);
});

test('the usage counter upsert is safe to call repeatedly in one day', () => {
  const before = generationsToday();
  for (let i = 0; i < 10; i += 1) recordGeneration();

  assert.equal(generationsToday(), before + 10);
});
