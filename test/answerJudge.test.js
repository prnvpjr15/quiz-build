process.env.BACKOFF_BASE_MS = '1';
process.env.LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const { judgeAnswer, resetJudgeCache } = require('../src/answerJudge');
const { setClientForTesting } = require('../src/llmClient');
const { transientError, fakeClient } = require('../test/helpers');
const metrics = require('../src/metrics');

const question = {
  questionId: 'q-sa',
  question: 'What is the captured scope record called?',
  expected: 'lexical environment',
  submitted: 'the record where the function was defined',
};

test.beforeEach(() => {
  resetJudgeCache();
  metrics.reset();
});

test('returns the parsed judgement for a valid model response', async () => {
  const { stub, calls } = fakeClient([{ correct: true, reason: 'Same concept, different words.' }]);
  setClientForTesting(stub);

  const judgement = await judgeAnswer(question);

  assert.deepEqual(judgement, { correct: true, reason: 'Same concept, different words.' });
  assert.equal(calls.length, 1);
});

test('sends the question, reference answer, and submission to the model', async () => {
  const { stub, calls } = fakeClient([{ correct: false, reason: 'Different concept.' }]);
  setClientForTesting(stub);

  await judgeAnswer(question);
  const prompt = JSON.stringify(calls[0].contents);

  assert.match(prompt, /captured scope record/);
  assert.match(prompt, /lexical environment/);
  assert.match(prompt, /where the function was defined/);
  assert.match(calls[0].config.systemInstruction, /grade short free-text answers/i);
});

// Repeat attempts of the same quiz are common, and a judgement is
// deterministic given the same three inputs.
test('caches a judgement so a repeated answer costs nothing', async () => {
  const { stub, calls } = fakeClient([{ correct: true, reason: 'Equivalent.' }]);
  setClientForTesting(stub);

  const first = await judgeAnswer(question);
  const second = await judgeAnswer(question);

  assert.deepEqual(second, first);
  assert.equal(calls.length, 1, 'second judgement must come from cache');
  assert.equal(metrics.snapshot().judge.cacheHits, 1);
});

test('cache key ignores formatting differences in the submitted answer', async () => {
  const { stub, calls } = fakeClient([{ correct: true, reason: 'Equivalent.' }]);
  setClientForTesting(stub);

  await judgeAnswer(question);
  await judgeAnswer({ ...question, submitted: '  The Record Where The Function Was Defined!  ' });

  assert.equal(calls.length, 1);
});

test('cache is scoped per question, not per answer text', async () => {
  const { stub, calls } = fakeClient([{ correct: true, reason: 'Equivalent.' }]);
  setClientForTesting(stub);

  await judgeAnswer(question);
  await judgeAnswer({ ...question, questionId: 'a-different-question' });

  assert.equal(calls.length, 2, 'the same words can be right for one question and wrong for another');
});

// The judge is an enhancement, not a dependency: grading must survive it
// being down, so an outage surfaces as null rather than an exception.
test('returns null when the model is persistently unavailable', async () => {
  const { stub } = fakeClient([transientError(503)]);
  setClientForTesting(stub);

  assert.equal(await judgeAnswer(question), null);
  assert.equal(metrics.snapshot().judge.unavailable, 1);
});

test('returns null when the model never produces a valid judgement shape', async () => {
  const { stub, calls } = fakeClient([{ verdict: 'maybe' }]);
  setClientForTesting(stub);

  assert.equal(await judgeAnswer(question), null);
  assert.equal(calls.length, 2, 'judging retries once, then gives up rather than stalling grading');
});

test('a failed judgement is not cached', async () => {
  const { stub } = fakeClient([transientError(503)]);
  setClientForTesting(stub);
  assert.equal(await judgeAnswer(question), null);

  const { stub: healthy, calls } = fakeClient([{ correct: true, reason: 'Equivalent.' }]);
  setClientForTesting(healthy);

  assert.deepEqual(await judgeAnswer(question), { correct: true, reason: 'Equivalent.' });
  assert.equal(calls.length, 1);
});

test('judging uses a small output budget compared with generation', async () => {
  const { stub, calls } = fakeClient([{ correct: true, reason: 'Equivalent.' }]);
  setClientForTesting(stub);

  await judgeAnswer(question);
  assert.ok(calls[0].config.maxOutputTokens <= 512);
});
