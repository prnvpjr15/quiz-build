// Shared fixtures and the fake model client used across the test suite.

const validQuiz = {
  title: 'JavaScript Closures',
  topic: 'JavaScript closures',
  difficulty: 'medium',
  questions: [
    {
      type: 'multiple-choice',
      question: 'What does a closure capture?',
      options: ['The call stack', 'Its lexical environment', 'The global object'],
      correctAnswerIndex: 1,
      explanation: 'A closure retains a reference to its lexical environment.',
    },
    {
      type: 'true-false',
      question: 'Closures can outlive the function that created them.',
      correctAnswer: true,
      explanation: 'The captured environment survives as long as the closure does.',
    },
    {
      type: 'short-answer',
      question: 'What is the captured scope record called?',
      correctAnswer: 'lexical environment',
      explanation: 'The spec calls it the lexical environment.',
    },
  ],
};

// A response that parses as JSON but violates the schema: correctAnswerIndex
// points past the end of options, which the superRefine check rejects.
const schemaViolatingQuiz = {
  title: 'JavaScript Closures',
  topic: 'JavaScript closures',
  difficulty: 'medium',
  questions: [
    {
      type: 'multiple-choice',
      question: 'What does a closure capture?',
      options: ['The call stack', 'Its lexical environment'],
      correctAnswerIndex: 7,
      explanation: 'Out of range on purpose.',
    },
  ],
};

function transientError(status = 503) {
  const err = new Error('Service Unavailable');
  err.status = status;
  return err;
}

// Reproduces the shape of a real provider quota rejection, including the
// quota id that says which window was exceeded — the only signal available for
// telling "wait a minute" apart from "come back tomorrow".
function quotaError(scope = 'day') {
  const quotaId =
    scope === 'day'
      ? 'GenerateRequestsPerDayPerProjectPerModel-FreeTier'
      : 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier';

  const err = new Error(
    JSON.stringify({
      error: {
        code: 429,
        message: 'You exceeded your current quota, please check your plan and billing details.',
        status: 'RESOURCE_EXHAUSTED',
        details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId }] }],
      },
    })
  );
  err.status = 429;

  return err;
}

// Mirrors the surface llmClient uses from the @google/genai client. Yields
// queued responses in order; once exhausted it repeats the last one, so a
// single queued error models a persistently failing upstream.
//
// A queued Error is thrown, a string is returned as raw text, and anything
// else is JSON-stringified.
function fakeClient(responses) {
  const calls = [];
  let index = 0;

  return {
    calls,
    stub: {
      models: {
        async generateContent(request) {
          calls.push(request);
          const next = responses[Math.min(index, responses.length - 1)];
          index += 1;

          if (next instanceof Error) throw next;

          return {
            text: typeof next === 'string' ? next : JSON.stringify(next),
            usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 40 },
          };
        },
      },
    },
  };
}

module.exports = { validQuiz, schemaViolatingQuiz, transientError, quotaError, fakeClient };
