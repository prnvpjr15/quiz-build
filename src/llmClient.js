const { GoogleGenAI } = require('@google/genai');
const metrics = require('./metrics');
const { logger } = require('./logger');

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

function recordUsage(response) {
  const usage = response?.usageMetadata;
  if (!usage) return;

  metrics.increment('promptTokens', usage.promptTokenCount || 0);
  metrics.increment('completionTokens', usage.candidatesTokenCount || 0);
}

// Retries transient upstream failures with exponential backoff. Kept separate
// from the schema-correction loop below: a 503 is not the model's content
// being wrong, so it must not burn a correction attempt.
async function callModelWithBackoff(contents, { systemPrompt, maxOutputTokens, label }) {
  let lastError;

  for (let attempt = 1; attempt <= TRANSIENT_RETRIES; attempt += 1) {
    const startedAt = Date.now();

    try {
      const response = await getClient().models.generateContent({
        model: MODEL,
        contents,
        config: {
          systemInstruction: systemPrompt,
          // Constrains the decoder to emit syntactically valid JSON. Shape is
          // still enforced by Zod below — this only rules out malformed syntax.
          responseMimeType: 'application/json',
          maxOutputTokens,
        },
      });

      metrics.increment('llmCalls');
      metrics.observeLatency(label, Date.now() - startedAt);
      recordUsage(response);

      return response;
    } catch (err) {
      if (!isTransient(err)) {
        metrics.increment('llmFailures');
        throw err;
      }

      lastError = err;
      metrics.increment('llmTransientRetries');

      if (attempt < TRANSIENT_RETRIES) {
        const delay = BACKOFF_BASE_MS * 2 ** (attempt - 1);
        logger.warn('model unavailable, retrying', {
          attempt,
          of: TRANSIENT_RETRIES,
          delayMs: delay,
          label,
        });
        await sleep(delay);
      }
    }
  }

  metrics.increment('llmFailures');
  throw new UpstreamUnavailableError(
    `Model "${MODEL}" is unavailable after ${TRANSIENT_RETRIES} attempts. It may be under load — retry, or set GEMINI_MODEL to another model. Last error: ${lastError?.message || 'unknown'}`
  );
}

// Prompts the model for JSON and validates it against a Zod schema, feeding
// any validation errors back so the model can correct its own output.
// Shared by quiz generation and answer judging.
async function generateJson({
  systemPrompt,
  userPrompt,
  schema,
  shapeDescription,
  label,
  maxAttempts = 3,
  maxOutputTokens = 8192,
}) {
  // Conversation history grows with each failed attempt so the model sees its
  // own bad output alongside the validation errors it needs to correct.
  const contents = [userTurn(userPrompt)];
  const callOptions = { systemPrompt, maxOutputTokens, label };

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await callModelWithBackoff(contents, callOptions);

    const rawText = response.text || '';
    const candidate = stripCodeFences(rawText);

    let parsedJson;
    try {
      parsedJson = JSON.parse(candidate);
    } catch (err) {
      lastError = `Response was not valid JSON: ${err.message}`;
      metrics.increment('llmSchemaRetries');

      contents.push(modelTurn(rawText));
      contents.push(userTurn(`That was not valid JSON (${err.message}). ${shapeDescription}`));
      continue;
    }

    const result = schema.safeParse(parsedJson);
    if (result.success) {
      return result.data;
    }

    lastError = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    metrics.increment('llmSchemaRetries');

    contents.push(modelTurn(rawText));
    contents.push(userTurn(
      `That JSON did not match the required schema. Errors: ${lastError}. Return the corrected, complete JSON object only.`
    ));
  }

  metrics.increment('llmFailures');
  throw new Error(`Failed to generate a valid ${label} after ${maxAttempts} attempts: ${lastError}`);
}

module.exports = { generateJson, UpstreamUnavailableError, setClientForTesting, MODEL };
