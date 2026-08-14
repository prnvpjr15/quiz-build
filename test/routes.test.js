process.env.BACKOFF_BASE_MS = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../src/app');
const { setClientForTesting } = require('../src/llmService');
const { validQuiz, transientError, fakeClient } = require('./helpers');

const ANSWER_FIELDS = ['correctAnswerIndex', 'correctAnswer', 'explanation'];

// Walks the whole payload rather than checking known paths, so a leak
// introduced at any nesting depth still fails the test.
function assertNoAnswerFields(value, path = 'body') {
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoAnswerFields(item, `${path}[${i}]`));
    return;
  }
  if (value === null || typeof value !== 'object') return;

  for (const [key, child] of Object.entries(value)) {
    assert.ok(!ANSWER_FIELDS.includes(key), `leaked "${key}" at ${path}`);
    assertNoAnswerFields(child, `${path}.${key}`);
  }
}

async function generateQuiz() {
  const { stub } = fakeClient([validQuiz]);
  setClientForTesting(stub);

  const res = await request(app)
    .post('/api/quiz/generate')
    .send({ prompt: 'JavaScript closures', questionCount: 3, questionType: 'mixed' });

  assert.equal(res.status, 201);
  return res.body;
}

test('GET /health reports liveness', async () => {
  const res = await request(app).get('/health');

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ok' });
});

test('POST /api/quiz/generate returns 201 with a quiz id and public questions', async () => {
  const body = await generateQuiz();

  assert.ok(body.quizId);
  assert.equal(body.title, validQuiz.title);
  assert.equal(body.difficulty, 'medium');
  assert.equal(body.questions.length, 3);
  assert.ok(body.questions.every((q) => q.id && q.question && q.type));
});

test('POST /api/quiz/generate never returns answers or explanations', async () => {
  assertNoAnswerFields(await generateQuiz());
});

test('GET /api/quiz/:id never returns answers or explanations', async () => {
  const { quizId } = await generateQuiz();
  const res = await request(app).get(`/api/quiz/${quizId}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.quizId, quizId);
  assertNoAnswerFields(res.body);

  // The multiple-choice options must survive the stripping — only the answer
  // key is removed, not the content the user needs to answer.
  const mc = res.body.questions.find((q) => q.type === 'multiple-choice');
  assert.deepEqual(mc.options, validQuiz.questions[0].options);
});

test('POST /api/quiz/:id/submit grades against the stored quiz', async () => {
  const { quizId, questions } = await generateQuiz();
  const [mc, tf, sa] = questions;

  const res = await request(app).post(`/api/quiz/${quizId}/submit`).send({
    answers: [
      { questionId: mc.id, answer: 1 },
      { questionId: tf.id, answer: true },
      { questionId: sa.id, answer: 'call stack' },
    ],
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.score, 2);
  assert.equal(res.body.total, 3);
  assert.equal(res.body.results.length, 3);

  // Answers are legitimately revealed here — this is the review payload.
  assert.equal(res.body.results[0].correctAnswer, 1);
  assert.ok(res.body.results[0].explanation);
});

test('rejects an invalid generate request with 400 and field details', async () => {
  const res = await request(app).post('/api/quiz/generate').send({ prompt: 'JS' });

  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Invalid request');
  assert.ok(res.body.details.some((issue) => issue.path.includes('prompt')));
});

test('rejects an out-of-range questionCount with 400', async () => {
  const res = await request(app)
    .post('/api/quiz/generate')
    .send({ prompt: 'JavaScript closures', questionCount: 50 });

  assert.equal(res.status, 400);
});

test('returns 404 for an unknown quiz id', async () => {
  const res = await request(app).get('/api/quiz/does-not-exist');

  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'Quiz not found');
});

test('returns 404 when submitting to an unknown quiz id', async () => {
  const res = await request(app)
    .post('/api/quiz/does-not-exist/submit')
    .send({ answers: [{ questionId: 'x', answer: 1 }] });

  assert.equal(res.status, 404);
});

// A busy upstream is the caller's cue to retry; collapsing it into a generic
// 500 would tell them the request itself was broken.
test('maps a persistently unavailable model to 503, not 500', async () => {
  const { stub } = fakeClient([transientError(503)]);
  setClientForTesting(stub);

  const res = await request(app)
    .post('/api/quiz/generate')
    .send({ prompt: 'JavaScript closures' });

  assert.equal(res.status, 503);
  assert.match(res.body.error, /unavailable/i);
});
