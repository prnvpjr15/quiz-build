const test = require('node:test');
const assert = require('node:assert/strict');
const { gradeQuiz } = require('../src/scoring');

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
      question: 'Name it.',
      correctAnswer: 'lexical environment',
      explanation: 'That is the name.',
    },
  ],
};

function gradeOne(questionId, answer) {
  const { results } = gradeQuiz(quiz, [{ questionId, answer }]);
  return results.find((r) => r.questionId === questionId);
}

test('multiple-choice: matching index is correct', () => {
  assert.equal(gradeOne('q-mc', 1).correct, true);
});

test('multiple-choice: wrong index is incorrect', () => {
  assert.equal(gradeOne('q-mc', 2).correct, false);
});

test('multiple-choice: index arriving as a numeric string still matches', () => {
  assert.equal(gradeOne('q-mc', '1').correct, true);
});

test('true-false: matching boolean is correct', () => {
  assert.equal(gradeOne('q-tf-true', true).correct, true);
  assert.equal(gradeOne('q-tf-false', false).correct, true);
});

test('true-false: mismatched boolean is incorrect', () => {
  assert.equal(gradeOne('q-tf-true', false).correct, false);
  assert.equal(gradeOne('q-tf-false', true).correct, false);
});

// Guards the falsy-answer trap: an unanswered question whose correct answer
// happens to be `false` must not be scored as correct.
test('true-false: an unanswered false-answer question is incorrect, not a free point', () => {
  const { results } = gradeQuiz(quiz, [{ questionId: 'q-mc', answer: 1 }]);
  const unanswered = results.find((r) => r.questionId === 'q-tf-false');

  assert.equal(unanswered.correct, false);
  assert.equal(unanswered.userAnswer, null);
});

test('short-answer: casing and surrounding whitespace are ignored', () => {
  assert.equal(gradeOne('q-sa', '  Lexical Environment  ').correct, true);
});

test('short-answer: a different answer is incorrect', () => {
  assert.equal(gradeOne('q-sa', 'call stack').correct, false);
});

test('grades every question even when no answers are submitted', () => {
  const { score, total, results } = gradeQuiz(quiz, []);

  assert.equal(score, 0);
  assert.equal(total, 4);
  assert.equal(results.length, 4);
  assert.ok(results.every((r) => r.correct === false && r.userAnswer === null));
});

test('score counts only correct answers and ignores unknown question ids', () => {
  const { score, total } = gradeQuiz(quiz, [
    { questionId: 'q-mc', answer: 1 },
    { questionId: 'q-tf-true', answer: true },
    { questionId: 'q-sa', answer: 'wrong' },
    { questionId: 'does-not-exist', answer: 'ignored' },
  ]);

  assert.equal(score, 2);
  assert.equal(total, 4);
});

test('results expose the correct answer and explanation for review', () => {
  const mc = gradeOne('q-mc', 0);

  assert.equal(mc.correctAnswer, 1);
  assert.equal(mc.explanation, 'B is correct.');
  assert.equal(gradeOne('q-sa', 'x').correctAnswer, 'lexical environment');
});
