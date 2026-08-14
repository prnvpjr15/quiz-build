process.env.BACKOFF_BASE_MS = '1';
process.env.DB_PATH = ':memory:';
process.env.LOG_LEVEL = 'silent';
// Limits have their own suite; here they would just cap how many cases can run.
process.env.RATE_LIMIT_DISABLED = 'true';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../src/app');
const { setClientForTesting } = require('../src/llmClient');
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
  setClientForTesting(fakeClient([validQuiz]).stub);

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
  // key is removed, not the content the user needs in order to answer.
  const mc = res.body.questions.find((q) => q.type === 'multiple-choice');
  assert.deepEqual(mc.options, validQuiz.questions[0].options);
});

// Quizzes now live in SQLite rather than a process-local Map, so a quiz is
// still retrievable by id after the request that created it is long gone.
test('a generated quiz is retrievable by id from storage', async () => {
  const first = await generateQuiz();
  await generateQuiz();

  const res = await request(app).get(`/api/quiz/${first.quizId}`);

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.questions.map((q) => q.id), first.questions.map((q) => q.id));
});

test('POST /api/quiz/:id/submit grades against the stored quiz', async () => {
  const { quizId, questions } = await generateQuiz();
  const [mc, tf, sa] = questions;

  // Re-point the stub: the short answer below is wrong, so grading escalates
  // to the judge, which answers on this stub.
  setClientForTesting(fakeClient([{ correct: false, reason: 'Names a different structure.' }]).stub);

  const res = await request(app).post(`/api/quiz/${quizId}/submit`).send({
    answers: [
      { questionId: mc.id, answer: 1 },
      { questionId: tf.id, answer: true },
      { questionId: sa.id, answer: 'the call stack' },
    ],
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.score, 2);
  assert.equal(res.body.total, 3);

  // Answers are legitimately revealed here — this is the review payload.
  assert.equal(res.body.results[0].correctAnswer, 1);
  assert.ok(res.body.results[0].explanation);
  assert.equal(res.body.results[2].judgeReason, 'Names a different structure.');
});

// The behaviour exact matching used to get wrong, end to end.
test('a paraphrased short answer is accepted through the API', async () => {
  const { quizId, questions } = await generateQuiz();
  const shortAnswer = questions.find((q) => q.type === 'short-answer');

  setClientForTesting(fakeClient([{ correct: true, reason: 'Same concept, different words.' }]).stub);

  const res = await request(app)
    .post(`/api/quiz/${quizId}/submit`)
    .send({ answers: [{ questionId: shortAnswer.id, answer: 'the scope record from where it was defined' }] });

  const result = res.body.results.find((r) => r.questionId === shortAnswer.id);

  assert.equal(result.correct, true);
  assert.equal(result.matchType, 'semantic');
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
  setClientForTesting(fakeClient([transientError(503)]).stub);

  const res = await request(app)
    .post('/api/quiz/generate')
    .send({ prompt: 'JavaScript closures' });

  assert.equal(res.status, 503);
  assert.match(res.body.error, /unavailable/i);
});

// Upstream error text can quote the prompt or provider internals, so the
// client gets a generic message plus an id to quote in a bug report.
test('an internal failure returns a generic message and a request id', async () => {
  const badKey = new Error('API key AIzaSyLEAKED not valid');
  badKey.status = 401;
  setClientForTesting(fakeClient([badKey]).stub);

  const res = await request(app)
    .post('/api/quiz/generate')
    .send({ prompt: 'JavaScript closures' });

  assert.equal(res.status, 500);
  assert.equal(res.body.error, 'Internal server error');
  assert.ok(res.body.requestId);
  assert.doesNotMatch(JSON.stringify(res.body), /AIzaSyLEAKED/);
});

test('echoes a request id header for tracing', async () => {
  const res = await request(app).get('/health').set('x-request-id', 'trace-me');
  assert.equal(res.headers['x-request-id'], 'trace-me');
});

test('sets hardening headers via helmet', async () => {
  const res = await request(app).get('/health');

  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.ok(res.headers['content-security-policy']);
  assert.equal(res.headers['x-powered-by'], undefined);
});

test('GET /api/metrics reports usage, grading, and storage counters', async () => {
  await generateQuiz();
  const res = await request(app).get('/api/metrics');

  assert.equal(res.status, 200);
  assert.ok(res.body.llm.calls >= 1);
  assert.ok(res.body.tokens.total > 0);
  assert.ok(res.body.storage.quizzes >= 1);
  assert.ok('rescuedByFallbackRate' in res.body.shortAnswerGrading);
});

test('unknown routes return 404 JSON', async () => {
  const res = await request(app).get('/api/nope');

  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'Not found');
});
