const { normalize, isFuzzyMatch } = require("./textMatch");
const { judgeAnswer } = require("./answerJudge");
const { FREE_TEXT_TYPES } = require("./schema");
const metrics = require("./metrics");

const FREE_TEXT = new Set(FREE_TEXT_TYPES);

// Above this normalized-edit-distance ratio, a difference is a typo or an
// inflection rather than a different answer. Tuned to accept "lexical
// environments" for "lexical environment" while rejecting distinct terms.
const FUZZY_THRESHOLD = Number(process.env.FUZZY_MATCH_THRESHOLD) || 0.85;

const MATCH = {
	EXACT: "exact",
	FUZZY: "fuzzy",
	SEMANTIC: "semantic",
	NONE: "none",
	UNANSWERED: "unanswered",
};

// Short answers are graded in three escalating stages, cheapest first, so the
// model is consulted only for answers deterministic matching cannot settle.
// Exact matching alone rejects every correct paraphrase, which is the single
// biggest source of wrong scores.
async function gradeShortAnswer(question, userAnswer, judge) {
	const submitted = String(userAnswer);

	if (normalize(submitted) === normalize(question.correctAnswer)) {
		metrics.increment("shortAnswersExact");
		return { correct: true, matchType: MATCH.EXACT };
	}

	if (isFuzzyMatch(submitted, question.correctAnswer, FUZZY_THRESHOLD)) {
		metrics.increment("shortAnswersFuzzy");
		return { correct: true, matchType: MATCH.FUZZY };
	}

	const judgement = await judge({
		questionId: question.id,
		question: question.question,
		expected: question.correctAnswer,
		submitted,
	});

	// Judge unreachable: fall back to the deterministic verdict computed above
	// rather than failing the whole submission.
	if (!judgement) {
		metrics.increment("shortAnswersRejected");
		return { correct: false, matchType: MATCH.NONE };
	}

	metrics.increment(
		judgement.correct ? "shortAnswersSemantic" : "shortAnswersRejected",
	);

	return {
		correct: judgement.correct,
		matchType: judgement.correct ? MATCH.SEMANTIC : MATCH.NONE,
		judgeReason: judgement.reason,
	};
}

function gradeObjective(question, userAnswer) {
	switch (question.type) {
		case "multiple-choice":
			return {
				correct: Number(userAnswer) === question.correctAnswerIndex,
				matchType: MATCH.EXACT,
			};
		case "true-false":
			return {
				correct: Boolean(userAnswer) === question.correctAnswer,
				matchType: MATCH.EXACT,
			};
		default:
			return { correct: false, matchType: MATCH.NONE };
	}
}

// Async because short-answer grading may consult the model. The judge is
// injectable so tests can substitute a deterministic stub.
async function gradeQuiz(quiz, answers, { judge = judgeAnswer } = {}) {
	const answersByQuestionId = new Map(
		answers.map((a) => [a.questionId, a.answer]),
	);

	const results = await Promise.all(
		quiz.questions.map(async (question) => {
			const userAnswer = answersByQuestionId.get(question.id);

			let verdict;
			if (userAnswer === undefined) {
				verdict = { correct: false, matchType: MATCH.UNANSWERED };
			} else if (FREE_TEXT.has(question.type)) {
				verdict = await gradeShortAnswer(question, userAnswer, judge);
			} else {
				verdict = gradeObjective(question, userAnswer);
			}

			return {
				questionId: question.id,
				question: question.question,
				correct: verdict.correct,
				matchType: verdict.matchType,
				...(verdict.judgeReason ? { judgeReason: verdict.judgeReason } : {}),
				userAnswer: userAnswer ?? null,
				correctAnswer:
					question.type === "multiple-choice"
						? question.correctAnswerIndex
						: question.correctAnswer,
				explanation: question.explanation,
			};
		}),
	);

	metrics.increment("quizzesGraded");

	return {
		score: results.filter((r) => r.correct).length,
		total: results.length,
		results,
	};
}

module.exports = { gradeQuiz, MATCH };
