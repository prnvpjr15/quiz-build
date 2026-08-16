import Card from '../ui/Card';
import { isAnswered, typeLabel } from '../../lib/questionTypes';

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function OptionRow({ name, label, badge, checked, onChange }) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-xl p-3.5 ring-1 transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-600 has-[:focus-visible]:ring-offset-2 ${
        checked
          ? 'bg-accent-50 ring-accent-200'
          : 'bg-white ring-slate-200 hover:bg-slate-50 hover:ring-slate-300'
      }`}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />

      <span
        className={`flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-colors duration-150 ${
          checked ? 'bg-accent-600 text-white' : 'bg-slate-100 text-slate-500'
        }`}
        aria-hidden="true"
      >
        {badge}
      </span>

      <span className={`text-sm ${checked ? 'font-medium text-accent-700' : 'text-slate-700'}`}>
        {label}
      </span>
    </label>
  );
}

function AnswerInput({ question, value, onChange }) {
  const name = `question-${question.id}`;

  switch (question.type) {
    // Stored as the option's index, which is what the grader expects and what
    // the results come back as. Storing the text would also break on a quiz
    // that happened to repeat an option.
    case 'multiple-choice':
      return (
        <div className="space-y-2">
          {question.options.map((option, index) => (
            <OptionRow
              key={`${index}-${option}`}
              name={name}
              label={option}
              badge={OPTION_LETTERS[index]}
              checked={value === index}
              onChange={() => onChange(index)}
            />
          ))}
        </div>
      );

    case 'true-false':
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {[true, false].map((option) => (
            <OptionRow
              key={String(option)}
              name={name}
              label={option ? 'True' : 'False'}
              badge={option ? 'T' : 'F'}
              checked={value === option}
              onChange={() => onChange(option)}
            />
          ))}
        </div>
      );

    // Fill-in-the-blank and short answer differ in expected length, so the
    // short answer gets a textarea and the blank a single line.
    case 'fill-in-blank':
      return (
        <input
          type="text"
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Type your answer"
          autoComplete="off"
          aria-label="Your answer"
          className="w-full rounded-xl bg-white px-4 py-3 text-sm text-slate-900 ring-1 ring-slate-200 transition-shadow placeholder:text-slate-400 hover:ring-slate-300 focus:ring-2 focus:ring-accent-600"
        />
      );

    default:
      return (
        <textarea
          rows={3}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Type your answer"
          aria-label="Your answer"
          className="w-full resize-y rounded-xl bg-white px-4 py-3 text-sm text-slate-900 ring-1 ring-slate-200 transition-shadow placeholder:text-slate-400 hover:ring-slate-300 focus:ring-2 focus:ring-accent-600"
        />
      );
  }
}

export default function QuestionCard({ question, index, value, onChange }) {
  const answered = isAnswered(value);

  return (
    <Card as="fieldset" id={`question-${question.id}`} className="scroll-mt-28">
      <legend className="sr-only">
        Question {index + 1}: {question.question}
      </legend>

      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span
            className={`flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold tabular-nums transition-colors duration-200 ${
              answered ? 'bg-accent-600 text-white' : 'bg-slate-100 text-slate-500'
            }`}
            aria-hidden="true"
          >
            {index + 1}
          </span>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {typeLabel(question.type)}
          </span>
        </div>

        {answered && (
          <span className="shrink-0 text-xs font-semibold text-accent-600">Answered</span>
        )}
      </div>

      <p className="mb-5 text-base font-medium leading-relaxed text-slate-900">
        {question.question}
      </p>

      <AnswerInput question={question} value={value} onChange={onChange} />
    </Card>
  );
}
