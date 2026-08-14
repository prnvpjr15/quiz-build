const rateLimit = require('express-rate-limit');
const { generationsToday, recordGeneration } = require('../db');
const { logger } = require('../logger');

// Two independent protections, because they fail for different reasons:
//
//   per-IP rate limits  — stop one client monopolising a shared, paid resource
//   daily budget        — stop the whole service spending more than intended,
//                         however many clients are involved
//
// Generation calls the model and costs money; reads and grading do not, so
// they are limited far more loosely.
const DEFAULTS = {
  generatePerHour: 10,
  apiPer15Min: 300,
  maxDailyGenerations: 200,
};

function envInt(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const passthrough = (req, res, next) => next();

function isDisabled() {
  return process.env.RATE_LIMIT_DISABLED === 'true';
}

function limiter({ windowMs, limit, message }) {
  if (isDisabled()) return passthrough;

  return rateLimit({
    windowMs,
    limit,
    // Draft-7 RateLimit headers; the legacy X-RateLimit-* set is redundant.
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('rate limit exceeded', { requestId: req.id, path: req.originalUrl, ip: req.ip });
      res.status(429).json({ error: message });
    },
  });
}

function apiLimiter() {
  return limiter({
    windowMs: 15 * 60 * 1000,
    limit: envInt('API_LIMIT_PER_15MIN', DEFAULTS.apiPer15Min),
    message: 'Too many requests. Please slow down and try again shortly.',
  });
}

function generateLimiter() {
  return limiter({
    windowMs: 60 * 60 * 1000,
    limit: envInt('GENERATE_LIMIT_PER_HOUR', DEFAULTS.generatePerHour),
    message: 'Quiz generation limit reached for this hour. Please try again later.',
  });
}

// Service-wide spend ceiling, checked before the model is called and counted
// only once generation actually succeeds — a failed call costs nothing and
// should not consume budget.
function dailyBudget(req, res, next) {
  if (isDisabled()) return next();

  const cap = envInt('MAX_DAILY_GENERATIONS', DEFAULTS.maxDailyGenerations);
  const used = generationsToday();

  if (used >= cap) {
    logger.warn('daily generation budget exhausted', { requestId: req.id, used, cap });
    return res.status(429).json({
      error: 'This service has reached its daily quiz-generation limit. Please try again tomorrow.',
    });
  }

  next();
}

module.exports = { apiLimiter, generateLimiter, dailyBudget, recordGeneration };
