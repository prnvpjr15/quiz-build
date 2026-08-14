// Process-local metrics. Deliberately in-memory and unauthenticated-read:
// this is a single-process app, and the numbers exist to answer "what is this
// costing me and where is the time going", not to be a monitoring system.

const MAX_SAMPLES = 500;

const startedAt = Date.now();

const counters = {
  llmCalls: 0,
  llmTransientRetries: 0,
  llmSchemaRetries: 0,
  llmFailures: 0,
  promptTokens: 0,
  completionTokens: 0,
  quizzesGenerated: 0,
  quizzesGraded: 0,
  shortAnswersExact: 0,
  shortAnswersFuzzy: 0,
  shortAnswersSemantic: 0,
  shortAnswersRejected: 0,
  judgeCalls: 0,
  judgeCacheHits: 0,
  judgeUnavailable: 0,
};

// Bounded ring of recent durations per operation, so percentiles reflect
// current behaviour and memory stays flat on a long-running process.
const latencies = new Map();

function increment(name, by = 1) {
  if (!(name in counters)) throw new Error(`Unknown counter: ${name}`);
  counters[name] += by;
}

function observeLatency(label, ms) {
  if (!latencies.has(label)) latencies.set(label, []);
  const samples = latencies.get(label);

  samples.push(ms);
  if (samples.length > MAX_SAMPLES) samples.shift();
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[index]);
}

function latencySummary() {
  const summary = {};

  for (const [label, samples] of latencies) {
    const sorted = [...samples].sort((a, b) => a - b);
    summary[label] = {
      count: sorted.length,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      max: percentile(sorted, 100),
    };
  }

  return summary;
}

// Priced from environment rather than hardcoded, because token pricing is
// model- and tier-specific. Unset means cost is simply not reported rather
// than reported as a guess.
function estimatedCostUsd() {
  const inputPer1M = Number(process.env.PRICE_PER_1M_INPUT_USD);
  const outputPer1M = Number(process.env.PRICE_PER_1M_OUTPUT_USD);

  if (!inputPer1M && !outputPer1M) return null;

  const cost =
    (counters.promptTokens / 1e6) * (inputPer1M || 0) +
    (counters.completionTokens / 1e6) * (outputPer1M || 0);

  return Number(cost.toFixed(6));
}

function snapshot() {
  const shortAnswerTotal =
    counters.shortAnswersExact +
    counters.shortAnswersFuzzy +
    counters.shortAnswersSemantic +
    counters.shortAnswersRejected;

  return {
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    llm: {
      calls: counters.llmCalls,
      transientRetries: counters.llmTransientRetries,
      schemaRetries: counters.llmSchemaRetries,
      failures: counters.llmFailures,
      // The headline reliability number: how often the model's first answer
      // was unusable and had to be corrected.
      schemaRetryRate: counters.llmCalls
        ? Number((counters.llmSchemaRetries / counters.llmCalls).toFixed(4))
        : 0,
    },
    tokens: {
      prompt: counters.promptTokens,
      completion: counters.completionTokens,
      total: counters.promptTokens + counters.completionTokens,
      estimatedCostUsd: estimatedCostUsd(),
    },
    quizzes: {
      generated: counters.quizzesGenerated,
      graded: counters.quizzesGraded,
    },
    shortAnswerGrading: {
      exact: counters.shortAnswersExact,
      fuzzy: counters.shortAnswersFuzzy,
      semantic: counters.shortAnswersSemantic,
      rejected: counters.shortAnswersRejected,
      // Share of short answers that exact matching alone would have marked
      // wrong. This is the number that justifies the grading pipeline.
      rescuedByFallbackRate: shortAnswerTotal
        ? Number(
            ((counters.shortAnswersFuzzy + counters.shortAnswersSemantic) / shortAnswerTotal).toFixed(4)
          )
        : 0,
    },
    judge: {
      calls: counters.judgeCalls,
      cacheHits: counters.judgeCacheHits,
      unavailable: counters.judgeUnavailable,
    },
    latencyMs: latencySummary(),
  };
}

// Test-only: metrics are global state, so suites that assert on them need a
// clean slate between cases.
function reset() {
  for (const key of Object.keys(counters)) counters[key] = 0;
  latencies.clear();
}

module.exports = { increment, observeLatency, snapshot, reset };
