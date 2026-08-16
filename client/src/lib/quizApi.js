import { buildMockQuiz } from './mockQuiz';
import { isCorrect } from './questionTypes';

// The whole API surface the UI depends on, mocked. Both functions already
// return the shapes the real endpoints return, so going live means replacing
// the bodies here and nothing else.
//
//   generateQuiz  ->  POST /api/quiz/generate
//   submitQuiz    ->  POST /api/quiz/:id/submit
//
// One difference to expect at that point: the server strips correct answers
// from a generated quiz on purpose, so grading cannot happen in the browser.
// submitQuiz already takes that shape — answers in, results out — rather than
// comparing locally, so the seam holds.
const LATENCY_MS = 1400;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function generateQuiz(config) {
  await delay(LATENCY_MS);

  if (!config.topic.trim()) {
    throw new Error('Enter a topic to build a quiz.');
  }

  return buildMockQuiz(config);
}

export async function submitQuiz(quiz, answers) {
  await delay(500);

  const results = quiz.questions.map((question) => {
    const userAnswer = answers[question.id];

    return {
      questionId: question.id,
      question: question.question,
      type: question.type,
      options: question.options,
      correct: isCorrect(question, userAnswer),
      userAnswer: userAnswer ?? null,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation,
    };
  });

  return {
    score: results.filter((result) => result.correct).length,
    total: results.length,
    results,
  };
}
