require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { ZodError } = require('zod');
const quizRouter = require('./routes/quiz');
const { UpstreamUnavailableError } = require('./llmService');

if (!process.env.GEMINI_API_KEY) {
  console.error('Missing GEMINI_API_KEY. Copy .env.example to .env and set your key.');
  process.exit(1);
}

const app = express();

app.use(cors());
app.use(express.json());

// Serves the frontend at "/" — same origin as the API, so no CORS in play.
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api', (req, res) => res.json({
  service: 'AQuizBuild',
  endpoints: {
    'POST /api/quiz/generate': 'Create a quiz from a natural-language prompt',
    'GET /api/quiz/:id': 'Fetch a quiz with answers hidden',
    'POST /api/quiz/:id/submit': 'Submit answers and get a score',
    'GET /health': 'Liveness check',
  },
}));

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/quiz', quizRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Invalid request', details: err.issues });
  }
  if (err instanceof UpstreamUnavailableError) {
    return res.status(503).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AQuizBuild listening on port ${PORT}`));
