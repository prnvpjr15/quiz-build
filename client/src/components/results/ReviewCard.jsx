import Card from '../ui/Card';
import { formatAnswer, isAnswered, typeLabel } from '../../lib/questionTypes';

const CorrectIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden="true">
    <path
      fillRule="evenodd"
      d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
      clipRule="evenodd"
    />
  </svg>
);

const WrongIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden="true">
    <path
      fillRule="evenodd"
      d="M5.3 5.3a1 1 0 0 1 1.4 0L10 8.6l3.3-3.3a1 1 0 1 1 1.4 1.4L11.4 10l3.3 3.3a1 1 0 0 1-1.4 1.4L10 11.4l-3.3 3.3a1 1 0 0 1-1.4-1.4L8.6 10 5.3 6.7a1 1 0 0 1 0-1.4Z"
      clipRule="evenodd"
    />
  </svg>
);

function AnswerLine({ label, value, tone = 'neutral', muted = false }) {
  const tones = {
    correct: 'bg-correct-50 text-correct-700 ring-correct-200',
    wrong: 'bg-wrong-50 text-wrong-700 ring-wrong-200',
    neutral: 'bg-slate-50 text-slate-700 ring-slate-200',
  };

  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400 sm:w-28">
        {label}
      </span>
      <span
        className={`inline-block rounded-lg px-3 py-1.5 text-sm ring-1 ${tones[tone]} ${
          muted ? 'italic text-slate-400' : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}

// An answer accepted despite not matching the key literally looks arbitrary
// without a reason, so the grader's rationale is shown. `judgeReason` comes
// from the server's model judge; the rest are the deterministic stages.
function gradingNote(result) {
  if (!result.correct) return null;
  if (result.judgeReason) return result.judgeReason;

  if (result.matchType === 'fuzzy') return 'Accepted — read as a typo or a different word form.';
  if (result.matchType === 'semantic') return 'Accepted as equivalent to the reference answer.';

  return null;
}

export default function ReviewCard({ result, index }) {
  const { correct } = result;
  const answered = isAnswered(result.userAnswer);
  const note = gradingNote(result);

  return (
    <Card
      className={`transition-shadow ${
        correct ? 'ring-correct-200' : 'ring-wrong-200'
      }`}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span
            className={`flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold tabular-nums ${
              correct ? 'bg-correct-600 text-white' : 'bg-wrong-600 text-white'
            }`}
            aria-hidden="true"
          >
            {index + 1}
          </span>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {typeLabel(result.type)}
          </span>
        </div>

        {/* Colour is reinforced with an icon and text, so correctness does not
            depend on distinguishing green from red. */}
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold ${
            correct ? 'bg-correct-50 text-correct-700' : 'bg-wrong-50 text-wrong-700'
          }`}
        >
          {correct ? <CorrectIcon /> : <WrongIcon />}
          {correct ? 'Correct' : 'Incorrect'}
        </span>
      </div>

      <p className="mb-4 text-base font-medium leading-relaxed text-slate-900">{result.question}</p>

      <div className="space-y-2.5">
        <AnswerLine
          label="Your answer"
          value={answered ? formatAnswer(result, result.userAnswer) : 'Left blank'}
          tone={correct ? 'correct' : 'wrong'}
          muted={!answered}
        />

        {!correct && (
          <AnswerLine
            label="Correct answer"
            value={formatAnswer(result, result.correctAnswer)}
            tone="correct"
          />
        )}

        {note && (
          <p className="flex items-start gap-2 pt-1 text-sm text-slate-500 sm:pl-31">
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="mt-0.5 size-4 shrink-0 text-correct-600"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.7-9.3a1 1 0 0 0-1.4-1.4L9 10.6 7.7 9.3a1 1 0 0 0-1.4 1.4l2 2a1 1 0 0 0 1.4 0l4-4Z"
                clipRule="evenodd"
              />
            </svg>
            {note}
          </p>
        )}
      </div>

      {result.explanation && (
        <p className="mt-4 border-t border-slate-100 pt-4 text-sm leading-relaxed text-slate-500">
          {result.explanation}
        </p>
      )}
    </Card>
  );
}
