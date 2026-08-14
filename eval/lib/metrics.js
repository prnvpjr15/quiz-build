// Pure scoring functions for the eval harness. Kept free of I/O so they can be
// unit tested, which matters more here than usual: if the measurement code is
// wrong, every number the harness reports is wrong in a way nothing else
// would catch.

// Positive class is "the grader awarded the point".
//
//   falsePositive — a wrong answer scored as correct, which inflates scores
//   falseNegative — a correct answer scored as wrong, which is what users
//                   actually complain about
function confusionMatrix(results) {
  const matrix = { truePositive: 0, falsePositive: 0, trueNegative: 0, falseNegative: 0 };

  for (const { expected, actual } of results) {
    if (expected && actual) matrix.truePositive += 1;
    else if (!expected && actual) matrix.falsePositive += 1;
    else if (!expected && !actual) matrix.trueNegative += 1;
    else matrix.falseNegative += 1;
  }

  return matrix;
}

function ratio(numerator, denominator) {
  return denominator === 0 ? null : Number((numerator / denominator).toFixed(4));
}

function classificationMetrics(results) {
  const matrix = confusionMatrix(results);
  const { truePositive: tp, falsePositive: fp, trueNegative: tn, falseNegative: fn } = matrix;

  const precision = ratio(tp, tp + fp);
  const recall = ratio(tp, tp + fn);
  const f1 = precision === null || recall === null || precision + recall === 0
    ? null
    : Number(((2 * precision * recall) / (precision + recall)).toFixed(4));

  return {
    total: results.length,
    accuracy: ratio(tp + tn, results.length),
    precision,
    recall,
    f1,
    matrix,
  };
}

// How many cases each stage of the pipeline settled. The interesting figure is
// how far down the ladder work had to go, since only the last stage costs money.
function stageBreakdown(results) {
  const counts = {};

  for (const { matchType } of results) {
    const key = matchType || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  }

  return counts;
}

// Cases where the two runs disagree, so a model or prompt change shows up as a
// concrete list rather than a moved aggregate.
function diffRuns(current, baseline) {
  const baselineById = new Map(baseline.map((r) => [r.id, r]));
  const changes = [];

  for (const result of current) {
    const before = baselineById.get(result.id);
    if (!before || before.actual === result.actual) continue;

    changes.push({
      id: result.id,
      expected: result.expected,
      was: before.actual,
      now: result.actual,
      // Only one of these can be true, and which one decides whether the
      // change is a fix or a regression.
      improved: result.actual === result.expected,
    });
  }

  return {
    changed: changes.length,
    fixed: changes.filter((c) => c.improved).length,
    regressed: changes.filter((c) => !c.improved).length,
    cases: changes,
  };
}

// Aggregate quality checks for generated quizzes: things a schema cannot
// express but that still make a quiz bad.
function generationQuality(quizzes) {
  let requested = 0;
  let produced = 0;
  let typeMismatches = 0;
  let duplicateQuestions = 0;
  const answerPositions = {};

  for (const quiz of quizzes) {
    requested += quiz.requestedCount;
    produced += quiz.questions.length;

    const seen = new Set();
    for (const question of quiz.questions) {
      const normalized = question.question.trim().toLowerCase();
      if (seen.has(normalized)) duplicateQuestions += 1;
      seen.add(normalized);

      if (quiz.requestedType !== 'mixed' && question.type !== quiz.requestedType) {
        typeMismatches += 1;
      }

      if (question.type === 'multiple-choice') {
        const key = String(question.correctAnswerIndex);
        answerPositions[key] = (answerPositions[key] || 0) + 1;
      }
    }
  }

  return {
    quizzes: quizzes.length,
    requestedQuestions: requested,
    producedQuestions: produced,
    countAccuracy: ratio(produced, requested),
    typeMismatches,
    duplicateQuestions,
    // LLMs tend to favour particular option positions. A heavily skewed
    // distribution means the quiz is guessable without knowing the material.
    answerPositions,
    answerPositionSkew: positionSkew(answerPositions),
  };
}

// 0 = perfectly uniform across the positions used, 1 = every answer in the
// same slot.
function positionSkew(answerPositions) {
  const counts = Object.values(answerPositions);
  if (counts.length <= 1) return counts.length === 0 ? null : 1;

  const total = counts.reduce((sum, n) => sum + n, 0);
  const expected = total / counts.length;
  const deviation = counts.reduce((sum, n) => sum + Math.abs(n - expected), 0);

  return Number((deviation / (2 * total * (1 - 1 / counts.length))).toFixed(4));
}

module.exports = {
  confusionMatrix,
  classificationMetrics,
  stageBreakdown,
  diffRuns,
  generationQuality,
  positionSkew,
};
