process.env.BACKOFF_BASE_MS = '1';
process.env.DB_PATH = ':memory:';
process.env.LOG_LEVEL = 'silent';
// Read when routes/quiz.js builds its limiter at import time, so the wiring
// test below can exhaust the hourly allowance in two requests.
process.env.GENERATE_LIMIT_PER_HOUR = '1';
process.env.MAX_DAILY_GENERATIONS = '1000';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const app = require('../src/app');
const { generateLimiter, apiLimiter, dailyBudget } = require('../src/middleware/limits');
const { recordGeneration } = require('../src/db');
const { setClientForTesting } = require('../src/llmClient');
const { validQuiz, fakeClient } = require('./helpers');

// The limiters read their configuration when built, so each case can construct
// one with its own allowance.
function appWith(middleware) {
  const testApp = express();
  testApp.set('trust proxy', 1);
  testApp.get('/limited', middleware, (req, res) => res.json({ ok: true }));
  return testApp;
}

test('the generate limiter allows requests up to its hourly allowance', async () => {
  process.env.GENERATE_LIMIT_PER_HOUR = '3';
  const limited = appWith(generateLimiter());

  for (let i = 0; i < 3; i += 1) {
    assert.equal((await request(limited).get('/limited')).status, 200);
  }
});

test('the generate limiter rejects the request past its allowance with 429', async () => {
  process.env.GENERATE_LIMIT_PER_HOUR = '2';
  const limited = appWith(generateLimiter());

  await request(limited).get('/limited');
  await request(limited).get('/limited');
  const blocked = await request(limited).get('/limited');

  assert.equal(blocked.status, 429);
  assert.match(blocked.body.error, /generation limit reached/i);
});

test('the limiter advertises remaining allowance via RateLimit headers', async () => {
  process.env.GENERATE_LIMIT_PER_HOUR = '5';
  const limited = appWith(generateLimiter());

  const res = await request(limited).get('/limited');

  assert.ok(res.headers.ratelimit, 'draft-7 RateLimit header should be present');
  assert.equal(res.headers['x-ratelimit-limit'], undefined, 'legacy headers should be off');
});

test('the general api limiter is far looser than the generate limiter', async () => {
  process.env.API_LIMIT_PER_15MIN = '20';
  const limited = appWith(apiLimiter());

  for (let i = 0; i < 20; i += 1) {
    assert.equal((await request(limited).get('/limited')).status, 200);
  }

  assert.equal((await request(limited).get('/limited')).status, 429);
});

// The per-IP limiter cannot bound total spend, because spend is the sum across
// every client. The daily budget is what actually caps the bill.
test('the daily budget allows requests below the cap', async () => {
  process.env.MAX_DAILY_GENERATIONS = '5';
  const limited = appWith(dailyBudget);

  assert.equal((await request(limited).get('/limited')).status, 200);
});

test('the daily budget rejects with 429 once the cap is reached', async () => {
  process.env.MAX_DAILY_GENERATIONS = '2';
  const limited = appWith(dailyBudget);

  recordGeneration();
  recordGeneration();

  const blocked = await request(limited).get('/limited');

  assert.equal(blocked.status, 429);
  assert.match(blocked.body.error, /daily quiz-generation limit/i);

  process.env.MAX_DAILY_GENERATIONS = '1000';
});

test('a rejected generation does not consume daily budget', async () => {
  process.env.MAX_DAILY_GENERATIONS = '1000';

  // A validation failure never reaches the model, so it costs nothing.
  const before = (await request(app).get('/api/metrics')).body.storage.generationsToday;
  await request(app).post('/api/quiz/generate').send({ prompt: 'no' });
  const after = (await request(app).get('/api/metrics')).body.storage.generationsToday;

  assert.equal(after, before);
});

// Wiring check: the limiter is actually mounted on the expensive route, not
// just exported. GENERATE_LIMIT_PER_HOUR was set to 1 before app import.
//
// Requests carry their own X-Forwarded-For so this pair gets a fresh limiter
// bucket, independent of what earlier cases in this file already spent — the
// app trusts one proxy hop, which is what keys the limiter in production.
test('POST /api/quiz/generate is rate limited in the real app', async () => {
  setClientForTesting(fakeClient([validQuiz]).stub);

  const first = await request(app)
    .post('/api/quiz/generate')
    .set('X-Forwarded-For', '203.0.113.9')
    .send({ prompt: 'JavaScript closures' });
  const second = await request(app)
    .post('/api/quiz/generate')
    .set('X-Forwarded-For', '203.0.113.9')
    .send({ prompt: 'JavaScript closures' });

  assert.equal(first.status, 201);
  assert.equal(second.status, 429);
});
