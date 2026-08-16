import { useState } from 'react';
import { useQuiz } from '../../context/QuizContext';
import { isAnswered } from '../../lib/questionTypes';
import Button from '../ui/Button';
import QuestionCard from './QuestionCard';
import ProgressTracker from './ProgressTracker';

export default function QuizScreen() {
  const {
    quiz, config, answers, answerQuestion, submit, isSubmitting,
    answeredCount, totalQuestions, allAnswered, startOver,
  } = useQuiz();

  // Submitting with gaps is allowed, but only once the warning has been seen.
  const [showUnansweredWarning, setShowUnansweredWarning] = useState(false);

  const unanswered = quiz.questions.filter((question) => !isAnswered(answers[question.id]));

  function handleSubmit() {
    if (!allAnswered && !showUnansweredWarning) {
      setShowUnansweredWarning(true);
      return;
    }

    submit();
  }

  function jumpToFirstUnanswered() {
    const target = document.getElementById(`question-${unanswered[0].id}`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target?.querySelector('input, textarea')?.focus({ preventScroll: true });
  }

  return (
    <div className="animate-screen-in">
      <ProgressTracker
        answered={answeredCount}
        total={totalQuestions}
        title={quiz.title}
        timeLimitMinutes={config?.timeLimitMinutes}
        onExpire={submit}
      />

      {/* Bottom padding clears the floating submit bar. */}
      <div className="mx-auto w-full max-w-2xl px-4 pb-40 pt-6">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{quiz.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {/* Only the difficulty is capitalized — `capitalize` on the whole
                line also title-cases "questions". */}
            <span className="capitalize">{quiz.difficulty}</span> · {totalQuestions} question
            {totalQuestions === 1 ? '' : 's'}
          </p>
        </header>

        <div className="space-y-4">
          {quiz.questions.map((question, index) => (
            <QuestionCard
              key={question.id}
              question={question}
              index={index}
              value={answers[question.id]}
              onChange={(value) => answerQuestion(question.id, value)}
            />
          ))}
        </div>

        <div className="mt-8 text-center">
          <Button variant="ghost" onClick={startOver}>
            Discard and start over
          </Button>
        </div>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-slate-50 via-slate-50/95 to-transparent pb-4 pt-8">
        <div className="pointer-events-auto mx-auto w-full max-w-2xl px-4">
          {showUnansweredWarning && !allAnswered && (
            <div
              role="alert"
              className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-amber-200"
            >
              <span className="text-slate-700">
                {unanswered.length} question{unanswered.length === 1 ? '' : 's'} still blank — they
                will be marked incorrect.
              </span>
              <button
                type="button"
                onClick={jumpToFirstUnanswered}
                className="shrink-0 font-semibold text-accent-700 underline underline-offset-2 hover:text-accent-600"
              >
                Jump to it
              </button>
            </div>
          )}

          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full shadow-lg shadow-accent-600/15"
          >
            {isSubmitting
              ? 'Grading…'
              : showUnansweredWarning && !allAnswered
                ? 'Submit anyway'
                : 'Submit quiz'}
          </Button>
        </div>
      </div>
    </div>
  );
}
