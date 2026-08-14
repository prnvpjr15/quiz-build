# AQuizBuild

Turns a plain-text prompt (e.g. "JavaScript closures, medium difficulty") into a structured, gradable quiz using the Gemini API. Every LLM response is validated against a Zod schema and auto-retried with a correction prompt if it doesn't conform, so malformed data never reaches the client.

## Setup

Get a free API key from [Google AI Studio](https://aistudio.google.com/apikey), then:

```bash
npm install
cp .env.example .env   # then set GEMINI_API_KEY
npm run dev             # or: npm start
```

Then open **http://localhost:3000** — the frontend is served by the same Express process, so there's nothing else to start.

## Frontend

A dependency-free single page (`public/`) served by `express.static`, same-origin with the API so CORS never comes into play. Three states: build → take → results.

- Renders all three question types (radio options, True/False, free-text)
- Sends the type the grader expects — option index, boolean, or string
- Score ring, per-question correct/incorrect review, and the model's explanations
- Blocks submission while any question is unanswered
- Surfaces a friendly "model is busy" message on `503` rather than a raw error
- Model output is inserted with `textContent`, never `innerHTML`

## Architecture

- `src/llmService.js` — prompts Gemini, validates the response against the Zod schema, and retries (up to 3 attempts) with the validation errors fed back to the model on failure. Requests use `responseMimeType: 'application/json'` to constrain output to valid JSON syntax; Zod still enforces the actual shape.
  - Two independent retry layers: **schema correction** (bad content is sent back to the model with its validation errors) and **transient-failure backoff** (429/5xx from the API are retried up to 4 times with exponential backoff). A 503 never consumes a schema-correction attempt. If the model stays unavailable, the API returns `503`, not `500`.
- `src/schema.js` — Zod schemas for LLM output and API request/response bodies.
- `src/db.js` — storage layer (in-memory `Map`). Swap this module for Postgres/Mongo without touching routes.
- `src/scoring.js` — grades submitted answers server-side against the stored quiz.
- `src/routes/quiz.js` — HTTP routes; strips correct answers/explanations before sending a quiz to the client.
- `public/` — static frontend (`index.html`, `styles.css`, `app.js`).

## API

### `POST /api/quiz/generate`

```json
{
  "prompt": "JavaScript closures",
  "questionCount": 5,
  "difficulty": "medium",
  "questionType": "multiple-choice"
}
```

`questionType` is one of `multiple-choice`, `true-false`, `short-answer`, or `mixed`. Returns the quiz with answers withheld:

```json
{
  "quizId": "…",
  "title": "…",
  "topic": "…",
  "difficulty": "medium",
  "questions": [
    { "id": "…", "type": "multiple-choice", "question": "…", "options": ["…"] }
  ]
}
```

`GET /api` returns this endpoint list; `GET /health` is a liveness check.

### `GET /api/quiz/:id`

Returns the same answer-hidden shape as above.

### `POST /api/quiz/:id/submit`

```json
{
  "answers": [
    { "questionId": "…", "answer": 2 }
  ]
}
```

`answer` is the option index for `multiple-choice`, a boolean for `true-false`, or a string for `short-answer`. Returns:

```json
{
  "score": 4,
  "total": 5,
  "results": [
    { "questionId": "…", "correct": true, "userAnswer": 2, "correctAnswer": 2, "explanation": "…" }
  ]
}
```
