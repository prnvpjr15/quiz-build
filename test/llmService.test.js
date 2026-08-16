// Collapse the backoff schedule before llmClient reads it at import time,
// so the transient-retry tests finish in milliseconds rather than seconds.
process.env.BACKOFF_BASE_MS = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const { generateQuiz } = require('../src/llmService');
const { UpstreamUnavailableError, setClientForTesting } = require('../src/llmClient');
const {
  validQuiz,
  schemaViolatingQuiz,
  transientError,
  quotaError,
  fakeClient,
} = require('./helpers');
const metrics = require('../src/metrics');

const params = {
  prompt: 'JavaScript closures',
  questionCount: 3,
  difficulty: 'medium',
  questionType: 'mixed',
};

// The turns sent on a given call, flattened to a single searchable string.
function conversationText(request) {
  return JSON.stringify(request.contents);
}

test.beforeEach(() => metrics.reset());

test('returns a validated quiz with a server-assigned id per question', async () => {
  const { stub, calls } = fakeClient([validQuiz]);
  setClientForTesting(stub);

  const quiz = await generateQuiz(params);

  assert.equal(calls.length, 1);
  assert.equal(quiz.questions.length, 3);
  assert.ok(quiz.questions.every((q) => typeof q.id === 'string' && q.id.length > 0));
  assert.equal(new Set(quiz.questions.map((q) => q.id)).size, 3);
});

test('strips markdown code fences the model wraps around its JSON', async () => {
  const { stub } = fakeClient(['```json\n' + JSON.stringify(validQuiz) + '\n```']);
  setClientForTesting(stub);

  const quiz = await generateQuiz(params);
  assert.equal(quiz.title, validQuiz.title);
});

test('recovers from malformed JSON and then a schema violation, feeding errors back', async () => {
  const { stub, calls } = fakeClient([
    'here you go: {not valid json',
    schemaViolatingQuiz,
    validQuiz,
  ]);
  setClientForTesting(stub);

  const quiz = await generateQuiz(params);

  assert.equal(calls.length, 3, 'should take exactly three attempts');
  assert.equal(quiz.title, validQuiz.title);

  // Attempt 2 must carry the parse failure and the model's own bad output.
  const secondCall = conversationText(calls[1]);
  assert.match(secondCall, /not valid JSON/);
  assert.match(secondCall, /not valid json/);

  // Attempt 3 must carry the specific Zod issue from attempt 2, which is what
  // lets the model correct the field rather than guess.
  const thirdCall = conversationText(calls[2]);
  assert.match(thirdCall, /did not match the required schema/);
  assert.match(thirdCall, /correctAnswerIndex/);

  assert.equal(metrics.snapshot().llm.schemaRetries, 2);
});

test('gives up after MAX_ATTEMPTS of unusable content', async () => {
  const { stub, calls } = fakeClient([schemaViolatingQuiz]);
  setClientForTesting(stub);

  await assert.rejects(
    () => generateQuiz(params),
    (err) => {
      assert.ok(!(err instanceof UpstreamUnavailableError), 'bad content is not an upstream outage');
      assert.match(err.message, /after 3 attempts/);
      return true;
    }
  );

  assert.equal(calls.length, 3);
});

// The two retry layers are independent: an upstream outage is not the model
// producing wrong content, so it must not spend a schema-correction attempt.
test('a transient 503 is retried without consuming a schema-correction attempt', async () => {
  const { stub, calls } = fakeClient([transientError(503), validQuiz]);
  setClientForTesting(stub);

  const quiz = await generateQuiz(params);

  assert.equal(calls.length, 2);
  assert.equal(quiz.title, validQuiz.title);

  // The retry re-sent the original prompt untouched — no correction turns were
  // appended, so all three schema attempts remain available.
  assert.equal(calls[0].contents.length, 1);
  assert.equal(calls[1].contents.length, 1);
  assert.equal(metrics.snapshot().llm.schemaRetries, 0);
});

test('retries 429 rate limits as transient', async () => {
  const { stub, calls } = fakeClient([transientError(429), validQuiz]);
  setClientForTesting(stub);

  await generateQuiz(params);
  assert.equal(calls.length, 2);
});

test('a persistently unavailable model raises UpstreamUnavailableError', async () => {
  const { stub, calls } = fakeClient([transientError(503)]);
  setClientForTesting(stub);

  await assert.rejects(() => generateQuiz(params), UpstreamUnavailableError);

  // Four transient attempts, and no schema-correction attempts burned.
  assert.equal(calls.length, 4);
  assert.equal(metrics.snapshot().llm.schemaRetries, 0);
});

// The three failures behind a 503 need different advice, so they are
// classified rather than flattened into "the model is busy".
test('an exhausted daily quota is reported as daily-quota', async () => {
  const { stub } = fakeClient([quotaError('day')]);
  setClientForTesting(stub);

  await assert.rejects(
    () => generateQuiz(params),
    (err) => {
      assert.ok(err instanceof UpstreamUnavailableError);
      assert.equal(err.reason, 'daily-quota');
      assert.match(err.message, /daily request quota/i);
      return true;
    }
  );
});

// Retrying cannot recover an allowance that resets tomorrow, so the remaining
// attempts are skipped instead of delaying the error by the backoff schedule.
test('a daily quota failure gives up immediately instead of retrying', async () => {
  const { stub, calls } = fakeClient([quotaError('day')]);
  setClientForTesting(stub);

  await assert.rejects(() => generateQuiz(params), UpstreamUnavailableError);
  assert.equal(calls.length, 1, 'no point retrying a daily allowance');
});

test('a per-minute quota is reported as rate-limited and still retried', async () => {
  const { stub, calls } = fakeClient([quotaError('minute')]);
  setClientForTesting(stub);

  await assert.rejects(
    () => generateQuiz(params),
    (err) => {
      assert.equal(err.reason, 'rate-limited');
      return true;
    }
  );

  assert.equal(calls.length, 4, 'a per-minute window can clear, so retries are worth it');
});

test('a genuine outage is reported as overloaded', async () => {
  const { stub } = fakeClient([transientError(503)]);
  setClientForTesting(stub);

  await assert.rejects(
    () => generateQuiz(params),
    (err) => {
      assert.equal(err.reason, 'overloaded');
      assert.match(err.message, /unavailable/i);
      return true;
    }
  );
});

// Unrecognised wording must not strand a user who could simply retry.
test('an unrecognised 429 falls back to the retryable classification', async () => {
  const vague = new Error('Too Many Requests');
  vague.status = 429;

  const { stub } = fakeClient([vague]);
  setClientForTesting(stub);

  await assert.rejects(
    () => generateQuiz(params),
    (err) => {
      assert.equal(err.reason, 'rate-limited');
      return true;
    }
  );
});

test('a non-transient error propagates immediately without retrying', async () => {
  const badKey = new Error('API key not valid');
  badKey.status = 401;

  const { stub, calls } = fakeClient([badKey]);
  setClientForTesting(stub);

  await assert.rejects(() => generateQuiz(params), /API key not valid/);
  assert.equal(calls.length, 1, 'a 401 is not worth retrying');
});

test('constrains the decoder to JSON and passes the system prompt', async () => {
  const { stub, calls } = fakeClient([validQuiz]);
  setClientForTesting(stub);

  await generateQuiz(params);

  assert.equal(calls[0].config.responseMimeType, 'application/json');
  assert.match(calls[0].config.systemInstruction, /quiz generation engine/);
  assert.match(conversationText(calls[0]), /exactly 3 questions/);
});

// Keeping answer keys short is what lets deterministic matching handle most
// short answers without a judge call.
test('asks for concise short-answer keys when short answers are possible', async () => {
  const { stub, calls } = fakeClient([validQuiz]);
  setClientForTesting(stub);

  await generateQuiz({ ...params, questionType: 'short-answer' });
  assert.match(conversationText(calls[0]), /concise canonical answer/);
});

test('records token usage and latency for each call', async () => {
  const { stub } = fakeClient([validQuiz]);
  setClientForTesting(stub);

  await generateQuiz(params);
  const { tokens, llm, latencyMs } = metrics.snapshot();

  assert.equal(llm.calls, 1);
  assert.equal(tokens.prompt, 100);
  assert.equal(tokens.completion, 40);
  assert.equal(tokens.total, 140);
  assert.equal(latencyMs.quiz.count, 1);
});

test('estimated cost is reported only when token pricing is configured', async () => {
  const { stub } = fakeClient([validQuiz]);
  setClientForTesting(stub);
  await generateQuiz(params);

  assert.equal(metrics.snapshot().tokens.estimatedCostUsd, null);

  process.env.PRICE_PER_1M_INPUT_USD = '0.30';
  process.env.PRICE_PER_1M_OUTPUT_USD = '2.50';

  try {
    // 100 prompt tokens at $0.30/M + 40 completion tokens at $2.50/M.
    assert.equal(metrics.snapshot().tokens.estimatedCostUsd, 0.00013);
  } finally {
    delete process.env.PRICE_PER_1M_INPUT_USD;
    delete process.env.PRICE_PER_1M_OUTPUT_USD;
  }
});
