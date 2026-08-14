const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '..', 'results');

function percent(value) {
  return value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

function heading(text) {
  console.log(`\n${text}`);
  console.log('-'.repeat(text.length));
}

function table(rows) {
  const width = Math.max(...rows.map(([label]) => label.length));
  for (const [label, value] of rows) {
    console.log(`  ${label.padEnd(width)}  ${value}`);
  }
}

function writeResults(name, payload) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(RESULTS_DIR, `${name}-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));

  // Stable path for the most recent run, so a diff is one command away.
  const latest = path.join(RESULTS_DIR, `${name}-latest.json`);
  fs.writeFileSync(latest, JSON.stringify(payload, null, 2));

  return file;
}

function readBaseline(name) {
  const file = path.join(__dirname, '..', 'baselines', `${name}.json`);
  if (!fs.existsSync(file)) return null;

  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

module.exports = { percent, heading, table, writeResults, readBaseline, RESULTS_DIR };
