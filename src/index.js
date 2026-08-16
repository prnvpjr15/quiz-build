require('dotenv').config();
const fs = require('fs');
const path = require('path');
const app = require('./app');
const { logger } = require('./logger');

if (!process.env.GEMINI_API_KEY) {
  console.error('Missing GEMINI_API_KEY. Copy .env.example to .env and set your key.');
  process.exit(1);
}

// The frontend is a build artefact rather than committed source, so a fresh
// clone has no public/ until the client is built. The API still works without
// it, so this warns rather than exits.
const frontendEntry = path.join(__dirname, '..', 'public', 'index.html');
if (!fs.existsSync(frontendEntry)) {
  console.warn(
    'No frontend build found in public/. The API will serve, but "/" will 404.\n' +
      'Build it with:  npm run build     (or use `npm run dev`, which needs no build)'
  );
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  logger.info('QuizBuild started', {
    port: Number(PORT),
    model: process.env.GEMINI_MODEL || 'gemini-3.7-flash',
    dbPath: process.env.DB_PATH || 'data/quizzes.db',
    maxDailyGenerations: Number(process.env.MAX_DAILY_GENERATIONS) || 200,
  });
});
