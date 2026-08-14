require('dotenv').config();
const app = require('./app');

if (!process.env.GEMINI_API_KEY) {
  console.error('Missing GEMINI_API_KEY. Copy .env.example to .env and set your key.');
  process.exit(1);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AQuizBuild listening on port ${PORT}`));
