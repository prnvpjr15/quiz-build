const { GoogleGenAI } = require('@google/genai');
const { randomUUID } = require('crypto');
const { QuizGenerationSchema } = require('./schema');

const MAX_ATTEMPTS = 3;
const TRANSIENT_RETRIES = 4;
// Tunable so retry aggressiveness can be adjusted per environment, and so
// tests can collapse the backoff schedule instead of sleeping for seconds.
const BACKOFF_BASE_MS = Number(process.env.BACKOFF_BASE_MS) || 1000;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.7-flash';

// Constructed on first use, not at import time, so requiring this module
// never depends on the environment already being loaded.
let client;
function getClient() {
  if (!client) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
}

// Test seam: substitutes a stub exposing the same surface this module uses
// ({ models: { generateContent } }), so the retry and schema-correction paths
// can be driven without a network call or an API key.
function setClientForTesting(stub) {
  client = stub;
}

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

  return `Generate a ${difficulty}-difficulty quiz with exactly ${questionCount} questions about: ${prompt}\n\n${typeInstruction}\nEach explanation should briefly justify the correct answer.`;
}

function stripCodeFences(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

function userTurn(text) {
  return { role: 'user', parts: [{ text }] };
}

function modelTurn(text) {
  return { role: 'model', parts: [{ text }] };
}

function assignIds(quiz) {
  return {
    ...quiz,
    questions: quiz.questions.map((q) => ({ id: randomUUID(), ...q })),
  };
}

// Raised when the upstream model is unreachable rather than merely wrong.
// Routes map this to 503 so callers can tell "try again" from "bad request".
class UpstreamUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UpstreamUnavailableError';
  }
}

// Rate limits and capacity blips are expected on shared/free-tier quota.
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);

function isTransient(err) {
  return TRANSIENT_STATUSES.has(err?.status) || /UNAVAILABLE|RESOURCE_EXHAUSTED/.test(err?.message || '');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Retries transient upstream failures with exponential backoff. Kept separate
// from the schema-correction loop: a 503 is not the model's content being
// wrong, so it must not burn a correction attempt.
async function callModelWithBackoff(contents) {
  let lastError;

  for (let attempt = 1; attempt <= TRANSIENT_RETRIES; attempt += 1) {
    try {
      return await getClient().models.generateContent({
        model: MODEL,
        contents,
        config: {
          systemInstruction: buildSystemPrompt(),
          // Constrains the decoder to emit syntactically valid JSON. Shape is
          // still enforced by Zod below — this only rules out malformed syntax.
          responseMimeType: 'application/json',
          maxOutputTokens: 8192,
        },
      });
    } catch (err) {
      if (!isTransient(err)) throw err;

      lastError = err;
      if (attempt < TRANSIENT_RETRIES) {
        const delay = BACKOFF_BASE_MS * 2 ** (attempt - 1);
        console.warn(`Model unavailable (attempt ${attempt}/${TRANSIENT_RETRIES}), retrying in ${delay}ms`);
        await sleep(delay);
      }
    }
  }

  throw new UpstreamUnavailableError(
    `Model "${MODEL}" is unavailable after ${TRANSIENT_RETRIES} attempts. It may be under load — retry, or set GEMINI_MODEL to another model. Last error: ${lastError?.message || 'unknown'}`
  );
}

async function generateQuiz(params) {
  // Conversation history grows with each failed attempt so the model sees its
  // own bad output alongside the validation errors it needs to correct.
  const contents = [userTurn(buildUserPrompt(params))];

  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const response = await callModelWithBackoff(contents);

    const rawText = response.text || '';
    const candidate = stripCodeFences(rawText);

    let parsedJson;
    try {
      parsedJson = JSON.parse(candidate);
    } catch (err) {
      lastError = `Response was not valid JSON: ${err.message}`;
      contents.push(modelTurn(rawText));
      contents.push(userTurn(`That was not valid JSON (${err.message}). ${JSON_SHAPE_DESCRIPTION}`));
      continue;
    }

    const result = QuizGenerationSchema.safeParse(parsedJson);
    if (result.success) {
      return assignIds(result.data);
    }

    lastError = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');

    contents.push(modelTurn(rawText));
    contents.push(userTurn(
      `That JSON did not match the required schema. Errors: ${lastError}. Return the corrected, complete JSON object only.`
    ));
  }

  throw new Error(`Failed to generate a valid quiz after ${MAX_ATTEMPTS} attempts: ${lastError}`);
}

module.exports = { generateQuiz, UpstreamUnavailableError, setClientForTesting };
