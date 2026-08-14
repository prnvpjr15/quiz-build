const fs = require('fs');
const path = require('path');

// Promotes the most recent run to the committed regression baseline. Kept as
// an explicit step: a baseline should be a run someone looked at and accepted,
// never something a test run overwrites on its own.
const name = process.argv[2] || 'grading';

const latest = path.join(__dirname, 'results', `${name}-latest.json`);
const baselineDir = path.join(__dirname, 'baselines');
const baseline = path.join(baselineDir, `${name}.json`);

if (!fs.existsSync(latest)) {
  console.error(`No run to promote: ${path.relative(process.cwd(), latest)} does not exist.`);
  console.error(`Run "npm run eval:${name}" first.`);
  process.exit(1);
}

const run = JSON.parse(fs.readFileSync(latest, 'utf8'));

// A degraded run understates accuracy, so promoting it would bake a rate-limit
// artefact into the regression baseline and make every later run look like an
// improvement.
if (run.degraded && !process.argv.includes('--force')) {
  console.error(`Refusing to promote a degraded run from ${run.ranAt}.`);
  console.error('The judge was unreachable for some cases, so its accuracy is a lower bound.');
  console.error('Re-run the eval once quota allows, or pass --force if you know what you are doing.');
  process.exit(1);
}

fs.mkdirSync(baselineDir, { recursive: true });
fs.writeFileSync(baseline, JSON.stringify(run, null, 2));

console.log(`Promoted run from ${run.ranAt} (model: ${run.model}) to ${path.relative(process.cwd(), baseline)}`);
console.log(`Baseline accuracy: ${(run.stats.accuracy * 100).toFixed(1)}%`);
console.log('Commit this file so future runs are compared against it.');
