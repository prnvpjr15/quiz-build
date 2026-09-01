require("dotenv").config();

const { parseArgs } = require("node:util");
const path = require("node:path");
const fs = require("node:fs");

const { values: flags } = parseArgs({
	options: {
		limit: { type: "string" },
		verbose: { type: "boolean", default: false },
		help: { type: "boolean", default: false },
	},
});

if (flags.help) {
	console.log(`
Generates quizzes from a fixed prompt set and measures output quality.
Requires GEMINI_API_KEY and makes real model calls.

  npm run eval:generation
  npm run eval:generation -- --limit 3
  npm run eval:generation -- --verbose
`);
	process.exit(0);
}

if (!flags.verbose) process.env.LOG_LEVEL = "silent";

const { generateQuiz } = require("../src/llmService");
const metrics = require("../src/metrics");
const { generationQuality } = require("./lib/metrics");
const { percent, heading, table, writeResults } = require("./lib/report");

const dataset = JSON.parse(
	fs.readFileSync(
		path.join(__dirname, "datasets", "generation-prompts.json"),
		"utf8",
	),
);

const prompts = flags.limit
	? dataset.prompts.slice(0, Number(flags.limit))
	: dataset.prompts;

async function main() {
	if (!process.env.GEMINI_API_KEY) {
		console.error(
			"GEMINI_API_KEY is required — this eval makes real model calls.",
		);
		process.exit(1);
	}

	console.log(
		`Generation eval — ${prompts.length} prompts against ${process.env.GEMINI_MODEL || "gemini-3.7-flash"}\n`,
	);
	metrics.reset();

	const quizzes = [];
	const failures = [];

	for (const spec of prompts) {
		const startedAt = Date.now();

		try {
			const quiz = await generateQuiz(spec);

			quizzes.push({
				id: spec.id,
				requestedCount: spec.questionCount,
				requestedType: spec.questionType,
				questions: quiz.questions,
				durationMs: Date.now() - startedAt,
			});

			console.log(
				`  ok    ${spec.id.padEnd(16)} ${quiz.questions.length}/${spec.questionCount} questions  ${Date.now() - startedAt}ms`,
			);
		} catch (err) {
			failures.push({ id: spec.id, error: err.message });
			console.log(`  FAIL  ${spec.id.padEnd(16)} ${err.message}`);
		}
	}

	const quality = generationQuality(quizzes);
	const snapshot = metrics.snapshot();

	heading("Output quality");
	table([
		["prompts succeeded", `${quizzes.length}/${prompts.length}`],
		[
			"questions produced",
			`${quality.producedQuestions}/${quality.requestedQuestions}`,
		],
		["requested count honoured", percent(quality.countAccuracy)],
		["wrong question type", String(quality.typeMismatches)],
		["duplicate questions", String(quality.duplicateQuestions)],
		["answer position spread", JSON.stringify(quality.answerPositions)],
		[
			"position skew (0 even, 1 all one slot)",
			quality.answerPositionSkew === null
				? "n/a"
				: String(quality.answerPositionSkew),
		],
	]);

	// The reliability figure worth quoting: how often the model's first response
	// was unusable and had to be corrected.
	heading("Model reliability");
	table([
		["model calls", String(snapshot.llm.calls)],
		["schema corrections needed", String(snapshot.llm.schemaRetries)],
		["schema retry rate", percent(snapshot.llm.schemaRetryRate)],
		["transient retries", String(snapshot.llm.transientRetries)],
		["hard failures", String(snapshot.llm.failures)],
		["tokens", String(snapshot.tokens.total)],
		[
			"estimated cost",
			snapshot.tokens.estimatedCostUsd === null
				? "set PRICE_PER_1M_*_USD to report"
				: `$${snapshot.tokens.estimatedCostUsd}`,
		],
		[
			"p50 / p95 latency",
			snapshot.latencyMs.quiz
				? `${snapshot.latencyMs.quiz.p50}ms / ${snapshot.latencyMs.quiz.p95}ms`
				: "n/a",
		],
	]);

	if (failures.length > 0) {
		heading(`Failures (${failures.length})`);
		for (const failure of failures)
			console.log(`  ${failure.id}: ${failure.error}`);
	}

	const file = writeResults("generation", {
		ranAt: new Date().toISOString(),
		model: process.env.GEMINI_MODEL || "gemini-3.7-flash",
		quality,
		reliability: snapshot,
		failures,
		quizzes,
	});

	console.log(`\nWrote ${path.relative(process.cwd(), file)}\n`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
