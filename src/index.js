require('dotenv').config();
const app = require('./app');
const { logger } = require('./logger');

if (!process.env.GEMINI_API_KEY) {
  console.error('Missing GEMINI_API_KEY. Copy .env.example to .env and set your key.');
  process.exit(1);
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
