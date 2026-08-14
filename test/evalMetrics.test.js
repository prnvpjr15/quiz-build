const test = require('node:test');
const assert = require('node:assert/strict');
const {
  confusionMatrix,
  classificationMetrics,
  stageBreakdown,
  diffRuns,
  generationQuality,
  positionSkew,
} = require('../eval/lib/metrics');

// If the measurement code is wrong, every number the harness reports is wrong
// in a way nothing else would catch — so it gets the same treatment as src/.

test('confusionMatrix sorts outcomes into the four quadrants', () => {
  const matrix = confusionMatrix([
    { expected: true, actual: true },
    { expected: true, actual: true },
    { expected: false, actual: true },
    { expected: false, actual: false },
    { expected: true, actual: false },
  ]);

  assert.deepEqual(matrix, {
    truePositive: 2,
    falsePositive: 1,
    trueNegative: 1,
    falseNegative: 1,
  });
});

test('classificationMetrics computes accuracy, precision, recall, and F1', () => {
  const stats = classificationMetrics([
    { expected: true, actual: true },
    { expected: true, actual: true },
    { expected: true, actual: true },
    { expected: false, actual: true },
    { expected: true, actual: false },
    { expected: false, actual: false },
  ]);

  assert.equal(stats.total, 6);
  // 3 true positives + 1 true negative out of 6.
  assert.equal(stats.accuracy, 0.6667);
  // 3 of the 4 answers credited were genuinely correct.
  assert.equal(stats.precision, 0.75);
  // 3 of the 4 genuinely correct answers were credited.
  assert.equal(stats.recall, 0.75);
  assert.equal(stats.f1, 0.75);
});

test('classificationMetrics reports a perfect run without dividing by zero', () => {
  const stats = classificationMetrics([
    { expected: true, actual: true },
    { expected: false, actual: false },
  ]);

  assert.equal(stats.accuracy, 1);
  assert.equal(stats.precision, 1);
  assert.equal(stats.recall, 1);
});

test('classificationMetrics returns null rather than NaN when a class is absent', () => {
  const stats = classificationMetrics([
    { expected: false, actual: false },
    { expected: false, actual: false },
  ]);

  assert.equal(stats.accuracy, 1);
  assert.equal(stats.precision, null, 'nothing was credited, so precision is undefined');
  assert.equal(stats.recall, null);
  assert.equal(stats.f1, null);
});

test('classificationMetrics handles an empty run', () => {
  const stats = classificationMetrics([]);

  assert.equal(stats.total, 0);
  assert.equal(stats.accuracy, null);
});

test('stageBreakdown counts which stage settled each case', () => {
  const counts = stageBreakdown([
    { matchType: 'exact' },
    { matchType: 'exact' },
    { matchType: 'fuzzy' },
    { matchType: 'semantic' },
    { matchType: undefined },
  ]);

  assert.deepEqual(counts, { exact: 2, fuzzy: 1, semantic: 1, unknown: 1 });
});

test('diffRuns separates fixes from regressions', () => {
  const baseline = [
    { id: 'a', expected: true, actual: false },
    { id: 'b', expected: false, actual: false },
    { id: 'c', expected: true, actual: true },
  ];
  const current = [
    { id: 'a', expected: true, actual: true },
    { id: 'b', expected: false, actual: true },
    { id: 'c', expected: true, actual: true },
  ];

  const drift = diffRuns(current, baseline);

  assert.equal(drift.changed, 2);
  assert.equal(drift.fixed, 1);
  assert.equal(drift.regressed, 1);
  assert.deepEqual(drift.cases.map((c) => c.id), ['a', 'b']);
  assert.equal(drift.cases[0].improved, true);
  assert.equal(drift.cases[1].improved, false);
});

test('diffRuns ignores cases absent from the baseline', () => {
  const drift = diffRuns(
    [{ id: 'new', expected: true, actual: false }],
    [{ id: 'old', expected: true, actual: true }]
  );

  assert.equal(drift.changed, 0);
});

test('generationQuality counts shortfalls, type mismatches, and duplicates', () => {
  const quality = generationQuality([
    {
      requestedCount: 3,
      requestedType: 'multiple-choice',
      questions: [
        { type: 'multiple-choice', question: 'What is a closure?', correctAnswerIndex: 0 },
        { type: 'multiple-choice', question: 'what is A CLOSURE?', correctAnswerIndex: 1 },
        { type: 'true-false', question: 'Closures exist.', correctAnswer: true },
      ],
    },
  ]);

  assert.equal(quality.producedQuestions, 3);
  assert.equal(quality.countAccuracy, 1);
  assert.equal(quality.typeMismatches, 1, 'a true-false question in a multiple-choice request');
  assert.equal(quality.duplicateQuestions, 1, 'duplicate detection ignores case and spacing');
  assert.deepEqual(quality.answerPositions, { 0: 1, 1: 1 });
});

test('generationQuality does not flag type mismatches for a mixed request', () => {
  const quality = generationQuality([
    {
      requestedCount: 2,
      requestedType: 'mixed',
      questions: [
        { type: 'multiple-choice', question: 'a', correctAnswerIndex: 0 },
        { type: 'true-false', question: 'b', correctAnswer: true },
      ],
    },
  ]);

  assert.equal(quality.typeMismatches, 0);
});

test('generationQuality reports a shortfall when the model returns too few questions', () => {
  const quality = generationQuality([
    { requestedCount: 5, requestedType: 'mixed', questions: [{ type: 'true-false', question: 'a' }] },
  ]);

  assert.equal(quality.countAccuracy, 0.2);
});

// A model that always puts the answer in slot B makes the quiz guessable.
test('positionSkew is 0 for an even spread and 1 when every answer shares a slot', () => {
  assert.equal(positionSkew({ 0: 5, 1: 5, 2: 5, 3: 5 }), 0);
  assert.equal(positionSkew({ 1: 20 }), 1);
});

test('positionSkew rises as answers concentrate', () => {
  const even = positionSkew({ 0: 10, 1: 10 });
  const lopsided = positionSkew({ 0: 18, 1: 2 });

  assert.ok(lopsided > even);
  assert.ok(lopsided <= 1);
});

test('positionSkew returns null when there are no multiple-choice answers', () => {
  assert.equal(positionSkew({}), null);
});
