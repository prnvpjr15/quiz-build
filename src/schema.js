const { z } = require('zod');

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const QUESTION_TYPES = ['multiple-choice', 'true-false', 'short-answer'];

const MultipleChoiceQuestion = z.object({
  type: z.literal('multiple-choice'),
  question: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(6),
  correctAnswerIndex: z.number().int().nonnegative(),
  explanation: z.string().min(1),
});

const TrueFalseQuestion = z.object({
  type: z.literal('true-false'),
  question: z.string().min(1),
  correctAnswer: z.boolean(),
  explanation: z.string().min(1),
});

const ShortAnswerQuestion = z.object({
  type: z.literal('short-answer'),
  question: z.string().min(1),
  correctAnswer: z.string().min(1),
  explanation: z.string().min(1),
});

// Shape the LLM must produce. IDs are assigned server-side after validation
// so the model never has to invent unique identifiers.
const QuestionContentSchema = z.discriminatedUnion('type', [
  MultipleChoiceQuestion,
  TrueFalseQuestion,
  ShortAnswerQuestion,
]).superRefine((q, ctx) => {
  if (q.type === 'multiple-choice' && q.correctAnswerIndex >= q.options.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'correctAnswerIndex must be a valid index into options',
      path: ['correctAnswerIndex'],
    });
  }
});

const QuizGenerationSchema = z.object({
  title: z.string().min(1),
  topic: z.string().min(1),
  difficulty: z.enum(DIFFICULTIES),
  questions: z.array(QuestionContentSchema).min(1),
});

const QuestionSchema = z.intersection(QuestionContentSchema, z.object({ id: z.string() }));

const QuizSchema = z.object({
  title: z.string().min(1),
  topic: z.string().min(1),
  difficulty: z.enum(DIFFICULTIES),
  questions: z.array(QuestionSchema).min(1),
});

const GenerateQuizRequestSchema = z.object({
  prompt: z.string().min(3, 'prompt must describe the quiz topic'),
  questionCount: z.number().int().min(1).max(20).default(5),
  difficulty: z.enum(DIFFICULTIES).default('medium'),
  questionType: z.enum([...QUESTION_TYPES, 'mixed']).default('multiple-choice'),
});

const SubmitAnswersRequestSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string(),
      answer: z.union([z.string(), z.boolean(), z.number()]),
    })
  ).min(1),
});

module.exports = {
  DIFFICULTIES,
  QUESTION_TYPES,
  QuestionContentSchema,
  QuizGenerationSchema,
  QuestionSchema,
  QuizSchema,
  GenerateQuizRequestSchema,
  SubmitAnswersRequestSchema,
};
