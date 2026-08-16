// The four answerable shapes, plus the "mixed" pseudo-type used only as a
// configuration shortcut. Everything that varies per type — the label, the
// input widget, how an answer is compared — is derived from these ids, so
// adding a type touches this file and one switch in QuestionCard.
export const QUESTION_TYPES = [
  { id: 'multiple-choice', label: 'Multiple choice', hint: 'One correct option' },
  { id: 'true-false', label: 'True / False', hint: 'Two-way statements' },
  { id: 'fill-in-blank', label: 'Fill in the blank', hint: 'Complete the sentence' },
  { id: 'short-answer', label: 'Short answer', hint: 'A word or phrase' },
  { id: 'mixed', label: 'Mixed', hint: 'A bit of everything' },
];

export const ANSWERABLE_TYPES = QUESTION_TYPES.filter((type) => type.id !== 'mixed');

export const DIFFICULTIES = [
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
];

export const QUESTION_COUNT = { min: 1, max: 25, default: 10 };

export const TIME_LIMIT_OPTIONS = [5, 10, 15, 30];

export function typeLabel(id) {
  return QUESTION_TYPES.find((type) => type.id === id)?.label ?? id;
}

// True/false answers travel as booleans and everything else as strings, so a
// blank check cannot simply test falsiness — `false` is a real answer.
export function isAnswered(answer) {
  if (answer === undefined || answer === null) return false;
  if (typeof answer === 'boolean') return true;
  return String(answer).trim().length > 0;
}

// Mirrors the server's grading for the mock: exact for options and booleans,
// case- and whitespace-insensitive for free text.
export function isCorrect(question, answer) {
  if (!isAnswered(answer)) return false;

  if (question.type === 'true-false') {
    return Boolean(answer) === Boolean(question.correctAnswer);
  }

  if (question.type === 'multiple-choice') {
    return String(answer) === String(question.correctAnswer);
  }

  return String(answer).trim().toLowerCase() === String(question.correctAnswer).trim().toLowerCase();
}

export function formatAnswer(question, answer) {
  if (!isAnswered(answer)) return 'No answer';
  if (question.type === 'true-false') return answer ? 'True' : 'False';
  return String(answer);
}
