const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { ZodError } = require('zod');
const quizRouter = require('./routes/quiz');
const { UpstreamUnavailableError } = require('./llmClient');
const { apiLimiter } = require('./middleware/limits');
const { logger, requestLogger } = require('./logger');
const metrics = require('./metrics');
const { countQuizzes, generationsToday } = require('./db');

// Builds the Express app without binding a port, so tests can drive it
// in-process. src/index.js owns the environment and the listen call.
const app = express();

// Rate limiting keys on req.ip, which behind a platform proxy (Render, Fly,
// Heroku) is the proxy unless a hop count is trusted. A specific number rather
// than `true`, which would let any client spoof X-Forwarded-For.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS) || 1);

app.use(helmet());
app.use(requestLogger);

// The frontend is served from this same origin, so CORS is off by default and
// only enabled when an explicit allowlist is configured for another client.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (allowedOrigins.length > 0) {
  app.use(cors({ origin: allowedOrigins }));
}

app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api', apiLimiter());

app.get('/api', (req, res) => res.json({
  service: 'AQuizBuild',
  endpoints: {
    'POST /api/quiz/generate': 'Create a quiz from a natural-language prompt',
    'GET /api/quiz/:id': 'Fetch a quiz with answers hidden',
    'POST /api/quiz/:id/submit': 'Submit answers and get a score',
    'GET /api/metrics': 'Model usage, cost, latency, and grading breakdown',
    'GET /health': 'Liveness check',
  },
}));

app.get('/api/metrics', (req, res) => res.json({
  ...metrics.snapshot(),
  storage: { quizzes: countQuizzes(), generationsToday: generationsToday() },
}));

app.use('/api/quiz', quizRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Invalid request', details: err.issues });
  }
  if (err instanceof UpstreamUnavailableError) {
    logger.warn('upstream unavailable', { requestId: req.id, error: err.message });
    return res.status(503).json({ error: err.message });
  }

  logger.error('unhandled error', { requestId: req.id, error: err.message, stack: err.stack });

  // Internal failure messages can carry prompt or provider detail, so the
  // client gets a generic message and the request id to quote.
  res.status(500).json({ error: 'Internal server error', requestId: req.id });
});

module.exports = app;
