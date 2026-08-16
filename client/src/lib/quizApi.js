// The real API. Same origin as the page in production; in development Vite
// proxies these paths to the Express process.
//
// Grading is deliberately not done here. The server strips correct answers
// from a generated quiz, and the third grading stage needs a model, so the
// browser submits answers and renders whatever verdict comes back.

const GENERIC_ERROR = 'Something went wrong. Please try again.';

async function readError(response) {
  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  // Rate limits and upstream outages are expected and worth explaining
  // precisely; anything else gets a generic message rather than raw server text.
  if (response.status === 429) {
    return body?.error || 'Too many requests right now. Please wait a moment and try again.';
  }
  // A 503 covers three situations that need different advice. Telling someone
  // whose daily allowance is gone to "try again in a few seconds" invites them
  // to click a button that cannot succeed.
  if (response.status === 503) {
    if (body?.code === 'daily-quota') {
      return 'This service has used its daily quiz allowance. Please try again tomorrow.';
    }
    if (body?.code === 'rate-limited') {
      return 'Quizzes are being generated faster than the limit allows. Wait about a minute and try again.';
    }
    return 'The model is busy at the moment. Please try again in a few seconds.';
  }
  if (response.status === 400) {
    return body?.error === 'Invalid request'
      ? 'That request was not valid. Adjust the options and try again.'
      : body?.error || GENERIC_ERROR;
  }
  if (response.status === 404) {
    return 'That quiz could not be found. It may have expired.';
  }

  return body?.error || GENERIC_ERROR;
}

async function post(path, payload) {
  let response;

  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error('Could not reach the server. Check that it is running.');
  }

  if (!response.ok) throw new Error(await readError(response));

  return response.json();
}

// The UI lets several types be selected; the API takes exactly one. Any
// combination beyond a single choice is a request for a mix.
function toQuestionType(types) {
  return types.length === 1 ? types[0] : 'mixed';
}

export async function generateQuiz({ topic, difficulty, types, questionCount }) {
  return post('/api/quiz/generate', {
    prompt: topic.trim(),
    questionCount,
    difficulty,
    questionType: toQuestionType(types),
  });
}

export async function submitQuiz(quiz, answers) {
  // Answers are already in the shape the grader expects: an option index for
  // multiple choice, a boolean for true/false, a string for free text.
  const submitted = quiz.questions
    .filter((question) => answers[question.id] !== undefined)
    .map((question) => ({ questionId: question.id, answer: answers[question.id] }));

  const graded = await post(`/api/quiz/${quiz.quizId}/submit`, { answers: submitted });

  // The graded results carry no type or options — the quiz the browser already
  // holds is the only place to recover what each question looked like, which
  // the review screen needs to render answers.
  const byId = new Map(quiz.questions.map((question) => [question.id, question]));

  return {
    ...graded,
    results: graded.results.map((result) => {
      const question = byId.get(result.questionId);

      return {
        ...result,
        type: question?.type,
        options: question?.options,
      };
    }),
  };
}
