const { randomUUID } = require('crypto');
const { QuizGenerationSchema } = require('./schema');
const { generateJson } = require('./llmClient');
const metrics = require('./metrics');

const MAX_ATTEMPTS = 3;

const JSON_SHAPE_DESCRIPTION = `Respond with ONLY a single JSON object, no markdown code fences and no prose before or after it. The object must match this exact shape:

{
  "title": string,
  "topic": string,
  "difficulty": "easy" | "medium" | "hard",
  "questions": [
    // one of the following per question, chosen by "type":
    {
      "type": "multiple-choice",
      "question": string,
      "options": string[],       // 2 to 6 options
      "correctAnswerIndex": number, // 0-based index into options
      "explanation": string
    },
    {
      "type": "true-false",
      "question": string,
      "correctAnswer": boolean,
      "explanation": string
    },
    {
      "type": "short-answer",
      "question": string,
      "correctAnswer": string,
      "explanation": string
    }
  ]
}`;

function buildSystemPrompt() {
  return `You are a quiz generation engine. You produce gradable quiz content as strict JSON. ${JSON_SHAPE_DESCRIPTION}`;
}

function buildUserPrompt({ prompt, questionCount, difficulty, questionType }) {
  const typeInstruction = questionType === 'mixed'
    ? 'Use a mix of "multiple-choice", "true-false", and "short-answer" question types.'
    : `Every question must have "type": "${questionType}".`;

  // Short-answer grading tolerates paraphrase, but a one-to-three word answer
  // key keeps the deterministic matching stages doing most of the work.
  const shortAnswerGuidance = questionType === 'short-answer' || questionType === 'mixed'
    ? '\nFor short-answer questions, "correctAnswer" must be a concise canonical answer of at most a few words, not a full sentence.'
    : '';

  return `Generate a ${difficulty}-difficulty quiz with exactly ${questionCount} questions about: ${prompt}\n\n${typeInstruction}\nEach explanation should briefly justify the correct answer.${shortAnswerGuidance}`;
}

function assignIds(quiz) {
  return {
    ...quiz,
    questions: quiz.questions.map((q) => ({ id: randomUUID(), ...q })),
  };
}

async function generateQuiz(params) {
  const quiz = await generateJson({
    systemPrompt: buildSystemPrompt(),
    userPrompt: buildUserPrompt(params),
    schema: QuizGenerationSchema,
    shapeDescription: JSON_SHAPE_DESCRIPTION,
    label: 'quiz',
    maxAttempts: MAX_ATTEMPTS,
    maxOutputTokens: 8192,
  });

  metrics.increment('quizzesGenerated');
  return assignIds(quiz);
}

module.exports = { generateQuiz };
