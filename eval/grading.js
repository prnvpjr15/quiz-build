require('dotenv').config();

const { parseArgs } = require('node:util');
const path = require('path');
const fs = require('fs');

const { values: flags } = parseArgs({
  options: {
    'no-judge': { type: 'boolean', default: false },
    limit: { type: 'string' },
    verbose: { type: 'boolean', default: false },
    // Gemini's free tier allows 5 requests/minute; exceeding it turns
    // judgements into 429s, which silently degrade the measurement.
    rpm: { type: 'string', default: '5' },
    'no-cache': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
});

if (flags.help) {
  console.log(`
Measures short-answer grading against a labeled dataset.

  npm run eval:grading                 all three modes (needs GEMINI_API_KEY)
  npm run eval:grading -- --no-judge   deterministic stages only, no API key
  npm run eval:grading -- --verbose    list every disagreement
  npm run eval:grading -- --limit 10   first N cases only
  npm run eval:grading -- --rpm 15     judge calls per minute (default 5)
  npm run eval:grading -- --no-cache   ignore recorded judgements, re-judge all

The judge is paced to --rpm because a rate-limited judgement degrades to a
fallback verdict, which makes the run unmeasurable. Any run where the judge
was unreachable is marked degraded and cannot be promoted to a baseline.

Judgements are recorded to eval/.cache and reused, so a run cut short by a
daily quota resumes rather than restarts. Repeat until no cases are degraded.
`);
  process.exit(0);
}

// Quiet the request/judge logging unless explicitly asked for; the harness
// prints its own report.
if (!flags.verbose) process.env.LOG_LEVEL = 'silent';

const { gradeQuiz } = require('../src/scoring');
const { judgeAnswer, resetJudgeCache } = require('../src/answerJudge');
const metrics = require('../src/metrics');
const { classificationMetrics, stageBreakdown, diffRuns } = require('./lib/metrics');
const { percent, heading, table, writeResults, readBaseline } = require('./lib/report');
const judgeCache = require('./lib/judgeCache');

const dataset = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'datasets', 'grading-cases.json'), 'utf8')
);

const cases = flags.limit ? dataset.cases.slice(0, Number(flags.limit)) : dataset.cases;

// The grading implementation this project shipped before the three-stage
// pipeline. Reproduced here so the harness can report what the change bought
// rather than asserting it.
function legacyExactMatch(testCase) {
  return (
    String(testCase.submitted).trim().toLowerCase() ===
    testCase.expected.trim().toLowerCase()
  );
}

function asQuiz(testCase) {
  return {
    title: 'eval',
    topic: 'eval',
    difficulty: 'medium',
    questions: [
      {
        id: testCase.id,
        type: 'short-answer',
        question: testCase.question,
        correctAnswer: testCase.expected,
        explanation: 'n/a',
      },
    ],
  };
}

// Runs every case through the real production grading path, swapping only the
// judge so the deterministic-only mode can be measured with the same code.
async function runMode(judge) {
  const results = [];

  for (const testCase of cases) {
    const { results: graded } = await gradeQuiz(
      asQuiz(testCase),
      [{ questionId: testCase.id, answer: testCase.submitted }],
      { judge }
    );

    results.push({
      id: testCase.id,
      band: testCase.band,
      expected: testCase.shouldBeCorrect,
      actual: graded[0].correct,
      matchType: graded[0].matchType,
      judgeReason: graded[0].judgeReason,
      question: testCase.question,
      reference: testCase.expected,
      submitted: testCase.submitted,
      note: testCase.note,
    });
  }

  return results;
}

function runLegacy() {
  return cases.map((testCase) => ({
    id: testCase.id,
    band: testCase.band,
    expected: testCase.shouldBeCorrect,
    actual: legacyExactMatch(testCase),
    matchType: 'exact-only',
    question: testCase.question,
    reference: testCase.expected,
    submitted: testCase.submitted,
    note: testCase.note,
  }));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Paces judge calls to stay inside the provider's per-minute quota. Without
// this the harness fires as fast as it can, collects 429s, and reports the
// resulting fallbacks as if they were genuine "incorrect" judgements.
function paced(judge, rpm) {
  const minIntervalMs = rpm > 0 ? 60000 / rpm : 0;
  let previousCall = 0;

  return async (args) => {
    const waitMs = previousCall + minIntervalMs - Date.now();
    if (waitMs > 0) await sleep(waitMs);

    previousCall = Date.now();
    return judge(args);
  };
}

function byBand(results) {
  const bands = new Map();

  for (const result of results) {
    if (!bands.has(result.band)) bands.set(result.band, []);
    bands.get(result.band).push(result);
  }

  return [...bands].map(([band, rows]) => [
    band,
    `${rows.filter((r) => r.actual === r.expected).length}/${rows.length}`,
  ]);
}

function reportMode(label, results) {
  const stats = classificationMetrics(results);

  heading(label);
  table([
    ['accuracy', `${percent(stats.accuracy)}  (${stats.matrix.truePositive + stats.matrix.trueNegative}/${stats.total})`],
    ['precision', percent(stats.precision)],
    ['recall', percent(stats.recall)],
    ['F1', stats.f1 === null ? 'n/a' : stats.f1.toFixed(3)],
    ['wrong answers credited', String(stats.matrix.falsePositive)],
    ['correct answers denied', String(stats.matrix.falseNegative)],
  ]);

  console.log('\n  by band:');
  table(byBand(results).map(([band, score]) => [`  ${band}`, score]));

  return stats;
}

function listFailures(results) {
  const failures = results.filter((r) => r.actual !== r.expected);
  if (failures.length === 0) return;

  heading(`Disagreements (${failures.length})`);

  for (const failure of failures) {
    const direction = failure.expected ? 'should have been accepted' : 'should have been rejected';
    console.log(`\n  [${failure.id}] ${direction}`);
    console.log(`    Q:         ${failure.question}`);
    console.log(`    reference: ${failure.reference}`);
    console.log(`    submitted: ${failure.submitted}`);
    console.log(`    stage:     ${failure.matchType}`);
    if (failure.judgeReason) console.log(`    judge:     ${failure.judgeReason}`);
  }
}

async function main() {
  const useJudge = !flags['no-judge'];

  if (useJudge && !process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is required for the full pipeline. Use --no-judge to run the deterministic stages only.');
    process.exit(1);
  }

  console.log(`Grading eval — ${cases.length} labeled cases`);

  const legacy = runLegacy();
  const legacyStats = reportMode('1. Legacy exact match (pre-pipeline behaviour)', legacy);

  metrics.reset();
  const deterministic = await runMode(async () => null);
  const deterministicStats = reportMode('2. Normalization + fuzzy match (no model calls)', deterministic);

  let fullStats = null;
  let full = null;

  let degraded = false;

  if (useJudge) {
    metrics.reset();
    resetJudgeCache();

    const rpm = Number(flags.rpm);
    const model = process.env.GEMINI_MODEL || 'gemini-3.7-flash';

    // Reuse judgements recorded by earlier runs so a quota-limited run can
    // pick up where the last one stopped instead of restarting from zero.
    const cache = flags['no-cache'] ? { model, entries: {} } : judgeCache.load(model);
    const cached = judgeCache.cachedJudge(paced(judgeAnswer, rpm), cache);

    const known = Object.keys(cache.entries).length;
    console.log(`\nJudging at ${rpm} calls/minute (${known} judgement(s) already recorded)...`);

    full = await runMode(cached.judge);
    fullStats = reportMode('3. Full pipeline (normalization + fuzzy + model judge)', full);

    const snapshot = metrics.snapshot();
    degraded = snapshot.judge.unavailable > 0;
    heading('Cost of the judge');
    table([
      ['model calls', String(snapshot.llm.calls)],
      ['tokens', String(snapshot.tokens.total)],
      ['estimated cost', snapshot.tokens.estimatedCostUsd === null
        ? 'set PRICE_PER_1M_*_USD to report'
        : `$${snapshot.tokens.estimatedCostUsd}`],
      ['judge unavailable', String(snapshot.judge.unavailable)],
      ['p50 / p95 latency', snapshot.latencyMs.judge
        ? `${snapshot.latencyMs.judge.p50}ms / ${snapshot.latencyMs.judge.p95}ms`
        : 'n/a'],
      ['reused from cache', String(cached.stats.hits)],
      ['cases settled per stage', JSON.stringify(stageBreakdown(full))],
    ]);

    // A case that reached stage 3 and came back with no reason attached was
    // never actually judged — the model was unreachable and grading fell back
    // to "incorrect".
    if (degraded) {
      const fallbacks = full.filter((r) => r.matchType === 'none' && !r.judgeReason);
      const flattered = fallbacks.filter((r) => r.actual === r.expected);

      console.log(`
  !! DEGRADED RUN — the judge was unreachable for ${snapshot.judge.unavailable} case(s).

     ${fallbacks.length} case(s) were decided by fallback rather than judged.
     Of those, ${flattered.length} happened to agree with the label anyway —
     scored correct without ever being tested.

     Degradation does not simply understate accuracy: on a case whose label is
     "incorrect", falling back to "incorrect" flatters the result. This number
     is not a measurement in either direction. Re-run to fill the gaps —
     judgements already recorded are reused, so each run needs less quota.`);
    }
  }

  const final = full || deterministic;
  const finalStats = fullStats || deterministicStats;

  heading('Summary');
  table([
    ['legacy exact match', percent(legacyStats.accuracy)],
    ['deterministic stages', percent(deterministicStats.accuracy)],
    ...(fullStats ? [['full pipeline', percent(fullStats.accuracy)]] : []),
    ['improvement over legacy', `${((finalStats.accuracy - legacyStats.accuracy) * 100).toFixed(1)} points`],
  ]);

  if (flags.verbose) listFailures(final);

  // Compare against a committed baseline so a prompt or model change surfaces
  // as named cases rather than a moved percentage.
  const baseline = readBaseline('grading');
  if (baseline) {
    const drift = diffRuns(final, baseline.results);

    heading('Against committed baseline');

    // Comparing a judged run against a deterministic baseline reports every
    // semantic case as "fixed", which says nothing about whether anything
    // actually changed.
    if (baseline.judgeEnabled !== useJudge) {
      console.log(`  note: baseline ran with judge ${baseline.judgeEnabled ? 'enabled' : 'disabled'}, this run with it ${useJudge ? 'enabled' : 'disabled'} —`);
      console.log('        differences below reflect the mode change, not a regression.\n');
    }
    table([
      ['baseline accuracy', percent(baseline.stats.accuracy)],
      ['current accuracy', percent(finalStats.accuracy)],
      ['cases changed', String(drift.changed)],
      ['fixed', String(drift.fixed)],
      ['regressed', String(drift.regressed)],
    ]);

    for (const change of drift.cases) {
      console.log(`  ${change.improved ? 'fixed   ' : 'REGRESS '} ${change.id}: ${change.was} -> ${change.now}`);
    }
  }

  const file = writeResults('grading', {
    ranAt: new Date().toISOString(),
    model: process.env.GEMINI_MODEL || 'gemini-3.7-flash',
    judgeEnabled: useJudge,
    degraded,
    stats: finalStats,
    comparison: {
      legacy: legacyStats,
      deterministic: deterministicStats,
      full: fullStats,
    },
    results: final,
  });

  console.log(`\nWrote ${path.relative(process.cwd(), file)}`);
  console.log('Promote a run to the regression baseline with: npm run eval:baseline\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
