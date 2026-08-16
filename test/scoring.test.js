const test = require('node:test');
const assert = require('node:assert/strict');
const { gradeQuiz, MATCH } = require('../src/scoring');
const metrics = require('../src/metrics');

const quiz = {
  title: 'T',
  topic: 't',
  difficulty: 'medium',
  questions: [
    {
      id: 'q-mc',
      type: 'multiple-choice',
      question: 'Pick B.',
      options: ['A', 'B', 'C'],
      correctAnswerIndex: 1,
      explanation: 'B is correct.',
    },
    {
      id: 'q-tf-true',
      type: 'true-false',
      question: 'This is true.',
      correctAnswer: true,
      explanation: 'It is.',
    },
    {
      id: 'q-tf-false',
      type: 'true-false',
      question: 'This is false.',
      correctAnswer: false,
      explanation: 'It is not.',
    },
    {
      id: 'q-sa',
      type: 'short-answer',
      question: 'What is the captured scope record called?',
      correctAnswer: 'lexical environment',
      explanation: 'That is the name.',
    },
    {
      id: 'q-fib',
      type: 'fill-in-blank',
      question: 'A closure captures its ______.',
      correctAnswer: 'lexical environment',
      explanation: 'That is the name.',
    },
  ],
};

// Records every call so tests can assert the judge was *not* consulted when
// deterministic matching already settled the answer.
function stubJudge(verdict) {
  const calls = [];

  const judge = async (args) => {
    calls.push(args);
    return typeof verdict === 'function' ? verdict(args) : verdict;
  };

  return { judge, calls };
}

async function gradeOne(questionId, answer, judgeStub = stubJudge(null)) {
  const { results } = await gradeQuiz(quiz, [{ questionId, answer }], { judge: judgeStub.judge });
  return results.find((r) => r.questionId === questionId);
}

test.beforeEach(() => metrics.reset());

test('multiple-choice: matching index is correct', async () => {
  assert.equal((await gradeOne('q-mc', 1)).correct, true);
});

test('multiple-choice: wrong index is incorrect', async () => {
  assert.equal((await gradeOne('q-mc', 2)).correct, false);
});

test('multiple-choice: index arriving as a numeric string still matches', async () => {
  assert.equal((await gradeOne('q-mc', '1')).correct, true);
});

test('true-false: matching boolean is correct', async () => {
  assert.equal((await gradeOne('q-tf-true', true)).correct, true);
  assert.equal((await gradeOne('q-tf-false', false)).correct, true);
});

test('true-false: mismatched boolean is incorrect', async () => {
  assert.equal((await gradeOne('q-tf-true', false)).correct, false);
  assert.equal((await gradeOne('q-tf-false', true)).correct, false);
});

// Guards the falsy-answer trap: an unanswered question whose correct answer
// happens to be `false` must not be scored as correct.
test('true-false: an unanswered false-answer question is incorrect, not a free point', async () => {
  const { results } = await gradeQuiz(quiz, [{ questionId: 'q-mc', answer: 1 }]);
  const unanswered = results.find((r) => r.questionId === 'q-tf-false');

  assert.equal(unanswered.correct, false);
  assert.equal(unanswered.matchType, MATCH.UNANSWERED);
  assert.equal(unanswered.userAnswer, null);
});

// Stage 1 of the grading pipeline.
test('short-answer: normalization alone settles casing, spacing, and punctuation', async () => {
  const judgeStub = stubJudge(null);
  const result = await gradeOne('q-sa', '  The Lexical Environment!  ', judgeStub);

  assert.equal(result.correct, true);
  assert.equal(result.matchType, MATCH.EXACT);
  assert.equal(judgeStub.calls.length, 0, 'an exact match must not cost a model call');
});

// Stage 2.
test('short-answer: a pluralized answer is accepted by fuzzy match, without the judge', async () => {
  const judgeStub = stubJudge(null);
  const result = await gradeOne('q-sa', 'lexical environments', judgeStub);

  assert.equal(result.correct, true);
  assert.equal(result.matchType, MATCH.FUZZY);
  assert.equal(judgeStub.calls.length, 0, 'a fuzzy match must not cost a model call');
});

test('short-answer: a typo is accepted by fuzzy match', async () => {
  const result = await gradeOne('q-sa', 'lexcial environment');

  assert.equal(result.correct, true);
  assert.equal(result.matchType, MATCH.FUZZY);
});

// Stage 3 — the case exact matching used to get wrong.
test('short-answer: a correct paraphrase is accepted by the judge', async () => {
  const judgeStub = stubJudge({ correct: true, reason: 'Describes the same scope record.' });
  const result = await gradeOne(
    'q-sa',
    'the environment record where the function was defined',
    judgeStub
  );

  assert.equal(result.correct, true);
  assert.equal(result.matchType, MATCH.SEMANTIC);
  assert.equal(result.judgeReason, 'Describes the same scope record.');
  assert.equal(judgeStub.calls.length, 1);
});

test('short-answer: the judge receives the question, reference, and submission', async () => {
  const judgeStub = stubJudge({ correct: true, reason: 'ok' });
  await gradeOne('q-sa', 'somewhere the variables live', judgeStub);

  assert.deepEqual(judgeStub.calls[0], {
    questionId: 'q-sa',
    question: 'What is the captured scope record called?',
    expected: 'lexical environment',
    submitted: 'somewhere the variables live',
  });
});

test('short-answer: a wrong answer the judge rejects stays incorrect', async () => {
  const judgeStub = stubJudge({ correct: false, reason: 'Names a different structure.' });
  const result = await gradeOne('q-sa', 'the call stack', judgeStub);

  assert.equal(result.correct, false);
  assert.equal(result.matchType, MATCH.NONE);
  assert.equal(result.judgeReason, 'Names a different structure.');
});

// Availability requirement: a judge outage must degrade grading, not break it.
test('short-answer: an unavailable judge falls back to incorrect instead of throwing', async () => {
  const judgeStub = stubJudge(null);
  const result = await gradeOne('q-sa', 'the call stack', judgeStub);

  assert.equal(result.correct, false);
  assert.equal(result.matchType, MATCH.NONE);
  assert.equal(result.judgeReason, undefined);
});

test('short-answer: an unanswered question never reaches the judge', async () => {
  const judgeStub = stubJudge({ correct: true, reason: 'should not be consulted' });
  const { results } = await gradeQuiz(quiz, [{ questionId: 'q-mc', answer: 1 }], {
    judge: judgeStub.judge,
  });

  assert.equal(results.find((r) => r.questionId === 'q-sa').correct, false);
  assert.equal(judgeStub.calls.length, 0);
});

// Fill-in-the-blank differs from short answer only in how the question reads,
// so it must go through the same three grading stages.
test('fill-in-blank is graded by the same pipeline as short answer', async () => {
  const exact = await gradeOne('q-fib', 'Lexical Environment.');
  assert.equal(exact.correct, true);
  assert.equal(exact.matchType, MATCH.EXACT);

  const fuzzy = await gradeOne('q-fib', 'lexical environments');
  assert.equal(fuzzy.correct, true);
  assert.equal(fuzzy.matchType, MATCH.FUZZY);

  const judgeStub = stubJudge({ correct: true, reason: 'Same concept.' });
  const semantic = await gradeOne('q-fib', 'the scope it was defined in', judgeStub);
  assert.equal(semantic.correct, true);
  assert.equal(semantic.matchType, MATCH.SEMANTIC);
  assert.equal(judgeStub.calls.length, 1);
});

test('grades every question even when no answers are submitted', async () => {
  const { score, total, results } = await gradeQuiz(quiz, []);

  assert.equal(score, 0);
  assert.equal(total, 5);
  assert.ok(results.every((r) => r.correct === false && r.userAnswer === null));
});

test('score counts only correct answers and ignores unknown question ids', async () => {
  const judgeStub = stubJudge({ correct: false, reason: 'no' });
  const { score, total } = await gradeQuiz(
    quiz,
    [
      { questionId: 'q-mc', answer: 1 },
      { questionId: 'q-tf-true', answer: true },
      { questionId: 'q-sa', answer: 'something else entirely' },
      { questionId: 'does-not-exist', answer: 'ignored' },
    ],
    { judge: judgeStub.judge }
  );

  assert.equal(score, 2);
  assert.equal(total, 5);
});

test('results expose the correct answer and explanation for review', async () => {
  const mc = await gradeOne('q-mc', 0);

  assert.equal(mc.correctAnswer, 1);
  assert.equal(mc.explanation, 'B is correct.');
  assert.equal((await gradeOne('q-sa', 'x')).correctAnswer, 'lexical environment');
});

test('records which grading stage settled each short answer', async () => {
  await gradeOne('q-sa', 'Lexical environment.');
  await gradeOne('q-sa', 'lexical environments');
  await gradeOne('q-sa', 'where vars live', stubJudge({ correct: true, reason: 'yes' }));
  await gradeOne('q-sa', 'the call stack', stubJudge({ correct: false, reason: 'no' }));

  const { shortAnswerGrading } = metrics.snapshot();

  assert.equal(shortAnswerGrading.exact, 1);
  assert.equal(shortAnswerGrading.fuzzy, 1);
  assert.equal(shortAnswerGrading.semantic, 1);
  assert.equal(shortAnswerGrading.rejected, 1);

  // Half of these answers would have been marked wrong by exact matching.
  assert.equal(shortAnswerGrading.rescuedByFallbackRate, 0.5);
});
