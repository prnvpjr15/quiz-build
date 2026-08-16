const test = require('node:test');
const assert = require('node:assert/strict');
const {
  QuestionContentSchema,
  GenerateQuizRequestSchema,
  QUESTION_TYPES,
} = require('../src/schema');

const fillInBlank = {
  type: 'fill-in-blank',
  question: 'A closure captures its ______.',
  correctAnswer: 'lexical environment',
  explanation: 'That is the name.',
};

test('fill-in-blank is an accepted question type', () => {
  assert.ok(QUESTION_TYPES.includes('fill-in-blank'));
  assert.equal(QuestionContentSchema.safeParse(fillInBlank).success, true);
});

// Without a blank it is a short-answer question wearing the wrong label, and
// the UI would render it as a sentence with nothing missing.
test('a fill-in-blank question without a blank is rejected', () => {
  const result = QuestionContentSchema.safeParse({
    ...fillInBlank,
    question: 'What does a closure capture?',
  });

  assert.equal(result.success, false);
  assert.match(result.error.issues[0].message, /must contain a blank/);
});

test('a single underscore is not accepted as a blank', () => {
  const result = QuestionContentSchema.safeParse({
    ...fillInBlank,
    question: 'A closure captures its _.',
  });

  assert.equal(result.success, false);
});

test('fill-in-blank requires a non-empty answer and explanation', () => {
  assert.equal(
    QuestionContentSchema.safeParse({ ...fillInBlank, correctAnswer: '' }).success,
    false
  );
  assert.equal(
    QuestionContentSchema.safeParse({ ...fillInBlank, explanation: '' }).success,
    false
  );
});

test('fill-in-blank can be requested through the API', () => {
  const parsed = GenerateQuizRequestSchema.parse({
    prompt: 'JavaScript closures',
    questionType: 'fill-in-blank',
  });

  assert.equal(parsed.questionType, 'fill-in-blank');
});

test('the other question types still validate', () => {
  const cases = [
    {
      type: 'multiple-choice',
      question: 'Pick one.',
      options: ['a', 'b'],
      correctAnswerIndex: 0,
      explanation: 'because',
    },
    { type: 'true-false', question: 'True?', correctAnswer: true, explanation: 'yes' },
    { type: 'short-answer', question: 'Name it.', correctAnswer: 'x', explanation: 'because' },
  ];

  for (const question of cases) {
    assert.equal(QuestionContentSchema.safeParse(question).success, true, question.type);
  }
});

test('an unknown question type is rejected', () => {
  assert.equal(
    QuestionContentSchema.safeParse({ ...fillInBlank, type: 'essay' }).success,
    false
  );
});
