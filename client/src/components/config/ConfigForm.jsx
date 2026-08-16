import { useState } from 'react';
import { useQuiz } from '../../context/QuizContext';
import { DIFFICULTIES, QUESTION_COUNT } from '../../lib/questionTypes';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Field from '../ui/Field';
import SegmentedControl from './SegmentedControl';
import TypeChips from './TypeChips';
import QuestionCountPicker from './QuestionCountPicker';
import TimeLimitToggle from './TimeLimitToggle';

const SUGGESTIONS = ['React Hooks', 'World War 2', 'Photosynthesis', 'Big-O notation'];

export default function ConfigForm() {
  const { generate, isGenerating, error } = useQuiz();

  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [types, setTypes] = useState(['multiple-choice']);
  const [questionCount, setQuestionCount] = useState(QUESTION_COUNT.default);
  const [timeLimitEnabled, setTimeLimitEnabled] = useState(false);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(10);

  const canGenerate = topic.trim().length > 0 && types.length > 0 && !isGenerating;

  function handleSubmit(event) {
    event.preventDefault();
    if (!canGenerate) return;

    generate({
      topic,
      difficulty,
      types,
      questionCount,
      timeLimitMinutes: timeLimitEnabled ? timeLimitMinutes : null,
    });
  }

  return (
    <div className="animate-screen-in mx-auto w-full max-w-2xl px-4 py-10 sm:py-16">
      <header className="mb-8 text-center sm:mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Build a quiz on anything
        </h1>
        <p className="mx-auto mt-3 max-w-md text-base text-slate-500">
          Describe a topic, choose the format, and get a gradable quiz in seconds.
        </p>
      </header>

      <Card as="form" onSubmit={handleSubmit} className="space-y-8">
        <Field
          label="What should the quiz cover?"
          htmlFor="topic"
          hint="Be as broad or specific as you like."
        >
          <input
            id="topic"
            type="text"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="e.g. The causes of World War 2"
            autoComplete="off"
            className="w-full rounded-xl bg-white px-4 py-3 text-base text-slate-900 ring-1 ring-slate-200 transition-shadow placeholder:text-slate-400 hover:ring-slate-300 focus:ring-2 focus:ring-accent-600"
          />

          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setTopic(suggestion)}
                className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Difficulty" as="fieldset">
          <SegmentedControl
            name="difficulty"
            options={DIFFICULTIES}
            value={difficulty}
            onChange={setDifficulty}
          />
        </Field>

        <Field
          label="Question types"
          as="fieldset"
          hint="Pick one or more, or choose Mixed for a spread."
        >
          <TypeChips value={types} onChange={setTypes} />
        </Field>

        <Field label="How many questions?" as="fieldset">
          <QuestionCountPicker value={questionCount} onChange={setQuestionCount} />
        </Field>

        <div className="border-t border-slate-100 pt-6">
          <TimeLimitToggle
            enabled={timeLimitEnabled}
            minutes={timeLimitMinutes}
            onToggle={setTimeLimitEnabled}
            onMinutesChange={setTimeLimitMinutes}
          />
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-wrong-50 px-4 py-3 text-sm text-wrong-700">
            {error}
          </p>
        )}

        <div className="space-y-3">
          <Button type="submit" size="lg" disabled={!canGenerate} className="w-full">
            Generate quiz
          </Button>

          {/* Says why the button is dead rather than leaving the user guessing. */}
          {topic.trim().length === 0 && (
            <p className="text-center text-sm text-slate-400">Enter a topic to continue</p>
          )}
          {topic.trim().length > 0 && types.length === 0 && (
            <p className="text-center text-sm text-slate-400">Pick at least one question type</p>
          )}
        </div>
      </Card>
    </div>
  );
}
