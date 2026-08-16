// The four answerable shapes, plus the "mixed" pseudo-type used only as a
// configuration shortcut. These ids match the server's schema exactly, so a
// selection here is sent verbatim.
//
// No grading lives in this file. The server compares answers — including a
// model judge for free text that the browser cannot run — so the client only
// decides what to render.
export const QUESTION_TYPES = [
  { id: 'multiple-choice', label: 'Multiple choice', hint: 'One correct option' },
  { id: 'true-false', label: 'True / False', hint: 'Two-way statements' },
  { id: 'fill-in-blank', label: 'Fill in the blank', hint: 'Complete the sentence' },
  { id: 'short-answer', label: 'Short answer', hint: 'A word or phrase' },
  { id: 'mixed', label: 'Mixed', hint: 'A bit of everything' },
];

export const DIFFICULTIES = [
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
];

// The ceiling matches GenerateQuizRequestSchema; allowing more here would only
// produce a 400 from the server.
export const QUESTION_COUNT = { min: 1, max: 20, default: 10 };

export const TIME_LIMIT_OPTIONS = [5, 10, 15, 30];

export function typeLabel(id) {
  return QUESTION_TYPES.find((type) => type.id === id)?.label ?? id;
}

// True/false answers are booleans and everything else is a string, so a blank
// check cannot simply test falsiness — `false` is a real answer.
export function isAnswered(answer) {
  if (answer === undefined || answer === null) return false;
  if (typeof answer === 'boolean') return true;
  return String(answer).trim().length > 0;
}

// Renders an answer for display. Multiple-choice answers come back from the
// grader as an index into the options, so they need resolving to text.
export function formatAnswer(question, answer) {
  if (!isAnswered(answer)) return 'No answer';
  if (question.type === 'true-false') return answer ? 'True' : 'False';

  if (question.type === 'multiple-choice') {
    const index = Number(answer);
    return question.options?.[index] ?? String(answer);
  }

  return String(answer);
}
