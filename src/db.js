const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { DatabaseSync } = require('node:sqlite');

// SQLite via Node's built-in driver: durable across restarts with no native
// build step and no new dependency. The save/get interface below is unchanged
// from the original in-memory Map, so no route needed touching for this swap.
const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'quizzes.db');

let db;

function getDb() {
  if (db) return db;

  const target = process.env.DB_PATH || DEFAULT_DB_PATH;
  if (target !== ':memory:') {
    fs.mkdirSync(path.dirname(target), { recursive: true });
  }

  db = new DatabaseSync(target);

  // WAL lets reads proceed during writes, which matters once grading and
  // generation overlap.
  db.exec('PRAGMA journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS quizzes (
      id         TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      payload    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS usage_counters (
      day         TEXT PRIMARY KEY,
      generations INTEGER NOT NULL DEFAULT 0
    );
  `);

  return db;
}

function utcDay() {
  return new Date().toISOString().slice(0, 10);
}

function saveQuiz(quiz) {
  const id = randomUUID();

  getDb()
    .prepare('INSERT INTO quizzes (id, created_at, payload) VALUES (?, ?, ?)')
    .run(id, new Date().toISOString(), JSON.stringify(quiz));

  return id;
}

function getQuiz(id) {
  const row = getDb().prepare('SELECT payload FROM quizzes WHERE id = ?').get(id);
  return row ? JSON.parse(row.payload) : undefined;
}

function countQuizzes() {
  return getDb().prepare('SELECT COUNT(*) AS n FROM quizzes').get().n;
}

// Upsert rather than read-modify-write, so concurrent generations cannot lose
// an increment and slip past the daily budget.
function recordGeneration() {
  getDb()
    .prepare(`
      INSERT INTO usage_counters (day, generations) VALUES (?, 1)
      ON CONFLICT(day) DO UPDATE SET generations = generations + 1
    `)
    .run(utcDay());
}

function generationsToday() {
  const row = getDb().prepare('SELECT generations FROM usage_counters WHERE day = ?').get(utcDay());
  return row ? row.generations : 0;
}

module.exports = { saveQuiz, getQuiz, countQuizzes, recordGeneration, generationsToday };
