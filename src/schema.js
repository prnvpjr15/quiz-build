const { z } = require("zod");

const DIFFICULTIES = ["easy", "medium", "hard"];
const QUESTION_TYPES = [
	"multiple-choice",
	"true-false",
	"short-answer",
	"fill-in-blank",
];

// Both are graded identically — free text compared against a reference answer.
// They differ only in how the question is posed, so the distinction lives in
// the prompt and the UI rather than in the grader.
const FREE_TEXT_TYPES = ["short-answer", "fill-in-blank"];

const MultipleChoiceQuestion = z.object({
	type: z.literal("multiple-choice"),
	question: z.string().min(1),
	options: z.array(z.string().min(1)).min(2).max(6),
	correctAnswerIndex: z.number().int().nonnegative(),
	explanation: z.string().min(1),
});

const TrueFalseQuestion = z.object({
	type: z.literal("true-false"),
	question: z.string().min(1),
	correctAnswer: z.boolean(),
	explanation: z.string().min(1),
});

const ShortAnswerQuestion = z.object({
	type: z.literal("short-answer"),
	question: z.string().min(1),
	correctAnswer: z.string().min(1),
	explanation: z.string().min(1),
});

const FillInBlankQuestion = z.object({
	type: z.literal("fill-in-blank"),
	question: z.string().min(1),
	correctAnswer: z.string().min(1),
	explanation: z.string().min(1),
});

// Shape the LLM must produce. IDs are assigned server-side after validation
// so the model never has to invent unique identifiers.
const QuestionContentSchema = z
	.discriminatedUnion("type", [
		MultipleChoiceQuestion,
		TrueFalseQuestion,
		ShortAnswerQuestion,
		FillInBlankQuestion,
	])
	.superRefine((q, ctx) => {
		if (
			q.type === "multiple-choice" &&
			q.correctAnswerIndex >= q.options.length
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "correctAnswerIndex must be a valid index into options",
				path: ["correctAnswerIndex"],
			});
		}

		// A fill-in-the-blank question that contains no blank is a short-answer
		// question wearing the wrong label, and the UI would render it misleadingly.
		if (q.type === "fill-in-blank" && !/_{2,}/.test(q.question)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"fill-in-blank questions must contain a blank written as ______",
				path: ["question"],
			});
		}
	});

const QuizGenerationSchema = z.object({
	title: z.string().min(1),
	topic: z.string().min(1),
	difficulty: z.enum(DIFFICULTIES),
	questions: z.array(QuestionContentSchema).min(1),
});

const QuestionSchema = z.intersection(
	QuestionContentSchema,
	z.object({ id: z.string() }),
);

const QuizSchema = z.object({
	title: z.string().min(1),
	topic: z.string().min(1),
	difficulty: z.enum(DIFFICULTIES),
	questions: z.array(QuestionSchema).min(1),
});

const GenerateQuizRequestSchema = z.object({
	prompt: z.string().min(3, "prompt must describe the quiz topic"),
	questionCount: z.number().int().min(1).max(20).default(5),
	difficulty: z.enum(DIFFICULTIES).default("medium"),
	questionType: z.enum([...QUESTION_TYPES, "mixed"]).default("multiple-choice"),
});

const SubmitAnswersRequestSchema = z.object({
	answers: z
		.array(
			z.object({
				questionId: z.string(),
				answer: z.union([z.string(), z.boolean(), z.number()]),
			}),
		)
		.min(1),
});

module.exports = {
	DIFFICULTIES,
	QUESTION_TYPES,
	FREE_TEXT_TYPES,
	QuestionContentSchema,
	QuizGenerationSchema,
	QuestionSchema,
	QuizSchema,
	GenerateQuizRequestSchema,
	SubmitAnswersRequestSchema,
};
