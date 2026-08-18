# QuizBuild

[![CI](https://github.com/prnvpjr15/quiz-build/actions/workflows/ci.yml/badge.svg)](https://github.com/prnvpjr15/quiz-build/actions/workflows/ci.yml)
[![Live demo](https://img.shields.io/badge/live%20demo-quiz--build-2ea44f)](https://quiz-build-2dm3.onrender.com)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-333)](package.json)

Turns a plain-text prompt (e.g. "JavaScript closures, medium difficulty") into a structured, gradable quiz using the Gemini API. Every LLM response is validated against a Zod schema and auto-retried with a correction prompt if it doesn't conform, so malformed data never reaches the client.

**Try it: [quiz-build-2dm3.onrender.com](https://quiz-build-2dm3.onrender.com)** — hosted on a free tier, so the first request after a period of inactivity takes ~30 seconds to wake the container.


## What it does

- **Generates** a quiz from a natural-language topic — multiple choice, true/false, short answer, or mixed
- **Validates** every model response against a Zod schema, re-prompting the model with its own validation errors when it doesn't conform
- **Grades** server-side, including free-text answers, which escalate through normalization → fuzzy matching → a model judge
- **Protects** the paid API behind per-IP rate limits and a service-wide daily spend cap
- **Reports** token usage, cost, latency percentiles, and grading breakdown at `/api/metrics`

## Setup

Get a free API key from [Google AI Studio](https://aistudio.google.com/apikey), then:

```bash
npm install
cp .env.example .env   # then set GEMINI_API_KEY
npm run dev
```

`npm run dev` prints one URL to open. It starts the API and the frontend together, installs the frontend's dependencies on first run, and moves to the next free port if something else already holds 3000 or 5173. Edits to either half reload automatically.

### Running the production build

```bash
npm run build   # compiles client/ into public/
npm start
```

Then open **http://localhost:3000** — Express serves the compiled frontend from `public/`, same origin as the API, so CORS never comes into play. `public/` is a build artefact and is not committed; if it is missing, the API still runs and the server says so on startup.

## Testing

```bash
npm test              # node --test
npm run test:coverage
```

No API key is required: the suite substitutes a stub for the model client, so the retry, grading, and rate-limit paths are all exercised offline.

The tests worth reading are the ones covering behaviour that is hard to verify by hand — that a schema correction actually feeds the model its own validation errors, that a 503 doesn't consume a correction attempt, that a quiz is never serialized with its answers attached, and that a judge outage degrades grading instead of failing the submission.

## Evals

Unit tests prove the code does what it was written to do. They cannot tell you whether the *grading* is any good, because that depends on a model's judgement. The eval harness measures that against a labeled dataset.

```bash
npm run eval:grading -- --no-judge   # deterministic stages, no API key needed
npm run eval:grading                 # full pipeline, makes real model calls
npm run eval:generation              # quiz quality across a fixed prompt set
npm run eval:baseline                # promote the last run to the regression baseline
```

`eval/datasets/grading-cases.json` holds 32 labeled short-answer cases grouped into bands — literal, fuzzy, semantic paraphrase, and hard negatives (wrong answers that look textually close to the right one, like `O(n log n)` for `O(log n)`). Each run scores three implementations against the same cases:

| | accuracy | recall | wrong answers credited |
| --- | --- | --- | --- |
| Legacy exact match | 50.0% | 15.8% | 0 |
| Normalization + fuzzy | 68.8% | 47.4% | 0 |
| Full pipeline | *needs quota to measure* | | |

Reporting the legacy implementation alongside the current one is the point: it turns "improved short-answer grading" into a measured delta rather than a claim. Precision stays at 100% across both deterministic modes — the pipeline recovers correct answers without ever crediting a wrong one, which is the trade that matters for a grader.

Two properties worth noting, both learned the hard way from a real run:

- **Runs are paced** (`--rpm`, default 5) because a rate-limited judgement silently degrades to "incorrect", which understates accuracy.
- **Degraded runs are marked as such** and refused by `eval:baseline`. A harness that reports a quota-starved run as a measurement is worse than no harness.

`eval/baselines/grading.json` is committed, so a prompt or model change shows up as a named list of fixed and regressed cases rather than a moved percentage.

## Architecture

- `src/llmClient.js` — the shared model client. Prompts for JSON, validates against a caller-supplied Zod schema, and retries with the validation errors fed back to the model on failure. Requests use `responseMimeType: 'application/json'` to constrain output to valid JSON syntax; Zod still enforces the actual shape.
  - Two independent retry layers: **schema correction** (bad content is sent back to the model with its validation errors) and **transient-failure backoff** (429/5xx from the API are retried up to 4 times with exponential backoff). A 503 never consumes a schema-correction attempt. If the model stays unavailable, the API returns `503`, not `500`.
- `src/llmService.js` — quiz-specific prompts on top of that client.
- `src/answerJudge.js` — model-based equivalence judging for free-text answers, with an LRU cache.
- `src/textMatch.js` — normalization and Levenshtein similarity, the deterministic half of grading.
- `src/scoring.js` — grades submitted answers server-side against the stored quiz.
- `src/schema.js` — Zod schemas for LLM output and API request/response bodies.
- `src/db.js` — SQLite storage via Node's built-in `node:sqlite`.
- `src/metrics.js` — token, cost, latency, and grading counters.
- `src/middleware/limits.js` — per-IP rate limits and a service-wide daily generation budget.
- `src/routes/quiz.js` — HTTP routes; strips correct answers/explanations before sending a quiz to the client.
- `public/` — static frontend (`index.html`, `styles.css`, `app.js`).

### Grading free-text answers

Exact string comparison marks any correct paraphrase wrong, which was the largest source of incorrect scores. Short answers now escalate through three stages and stop at the first one that settles the question:

1. **Normalized comparison** — case, accents, punctuation, whitespace, and a leading article are folded away. `"The Lexical Environment!"` matches `lexical environment`.
2. **Fuzzy match** — normalized Levenshtein similarity at or above `FUZZY_MATCH_THRESHOLD` (default 0.85) accepts typos and inflections, so `"lexical environments"` passes.
3. **Model judge** — only for answers the first two stages cannot settle. The model sees the question, the reference answer, and the submission, and returns `{correct, reason}` validated against a Zod schema.

The ordering is a cost decision: stages 1 and 2 are free, so the model is consulted only for genuinely ambiguous answers. Judgements are cached per question and normalized answer, so retaking a quiz costs nothing.

The judge is an enhancement, not a dependency. If it is unreachable, grading falls back to the deterministic verdict rather than failing the submission, and `/api/metrics` counts the degradation. Each result carries a `matchType` (`exact`, `fuzzy`, `semantic`, `none`, `unanswered`) so the frontend can explain a verdict the user might otherwise read as arbitrary.

### Abuse and cost controls

The generate endpoint calls a paid API, so it is protected by two independent mechanisms — per-IP rate limits stop one client monopolising the service, and a service-wide daily budget caps total spend however many clients are involved. The budget is counted only after a generation succeeds, so failed calls don't consume it. Reads and grading are limited far more loosely.

Also on by default: `helmet` security headers, a 64kb JSON body cap, CORS off unless `ALLOWED_ORIGINS` is set, and generic 500 responses that return a request id instead of internal error text.

## Frontend

React 19 + Tailwind 4, built with Vite from `client/` into `public/`, which Express serves — same origin as the API, so CORS never comes into play. Three screens: configure → take → results, swapped in place with no page reload.

```
client/src/
  context/QuizContext.jsx   flow state: screen, quiz, answers, results
  lib/quizApi.js            the API seam — generate and submit
  lib/questionTypes.js      type registry and answer comparison
  components/config/        ConfigForm, SegmentedControl, TypeChips, …
  components/quiz/          QuizScreen, QuestionCard, ProgressTracker, Timer
  components/results/       ResultsScreen, ResultsSummary, ReviewCard
```

State is `useState` in a single context provider. The flow is linear and the state is small, so a reducer or an external store would add ceremony without removing complexity.

- All questions on one scrollable page, each in its own card, with a sticky answered-count and progress bar
- Per-type inputs: options, True/False, single-line blanks, and a textarea for short answers
- Optional total-quiz timer that submits automatically on expiry
- Submitting with blanks is allowed, but warns first and offers to jump to the first one
- Score ring, per-question review with the correct answer and explanation
- Selection controls are real radios and checkboxes, visually hidden and styled from `:checked` — keyboard navigation and screen-reader semantics come from the platform rather than being reimplemented
- Correct/incorrect is never signalled by colour alone; every badge carries an icon and a text label
- Honours `prefers-reduced-motion`

## Configuration

All optional except the API key — see `.env.example` for the full list with defaults.

| Variable | Default | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | — | Required |
| `GEMINI_MODEL` | `gemini-3.7-flash` | Model id |
| `DB_PATH` | `data/quizzes.db` | SQLite file, or `:memory:` |
| `GENERATE_LIMIT_PER_HOUR` | `10` | Per-IP generation limit |
| `API_LIMIT_PER_15MIN` | `300` | Per-IP limit for all API routes |
| `MAX_DAILY_GENERATIONS` | `200` | Service-wide daily spend cap |
| `FUZZY_MATCH_THRESHOLD` | `0.85` | Similarity needed to skip the judge |
| `PRICE_PER_1M_INPUT_USD` / `PRICE_PER_1M_OUTPUT_USD` | unset | Enables cost reporting |
| `TRUST_PROXY_HOPS` | `1` | Proxy hops to trust for client IPs |
| `ALLOWED_ORIGINS` | unset | Enables CORS for other hosts |

## Docker

```bash
docker build -t quizbuild .
docker run -p 3000:3000 --env-file .env -v quizbuild-data:/app/data quizbuild
```

The volume keeps the SQLite database across redeploys; without it, quizzes are lost when the container is replaced.

The build is two-stage: the first compiles `client/` with Vite, the second copies only the resulting bundle into the runtime image. Vite, Tailwind, and the client's dependencies never reach production — the frontend adds about 2MB to the image — and because `public/` is excluded from the build context, the image cannot ship a stale locally-built bundle.

### Deploying

The live instance runs on Render from this Dockerfile, with `GEMINI_API_KEY` set as an environment variable and `/health` as the health check path. Attach a persistent disk mounted at `/app/data` — container filesystems are ephemeral, so without one the SQLite database resets on every deploy and previously generated quizzes 404.

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
    {
      "questionId": "…",
      "correct": true,
      "matchType": "semantic",
      "judgeReason": "Describes the same concept in different words.",
      "userAnswer": "…",
      "correctAnswer": "…",
      "explanation": "…"
    }
  ]
}
```

`judgeReason` is present only when the model judge decided the answer.

### `GET /api/metrics`

Model calls, schema-retry rate, token counts, estimated cost (when pricing is configured), latency percentiles by operation, the short-answer grading breakdown, and stored-quiz counts.
