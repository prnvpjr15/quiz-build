import { useQuiz } from '../../context/QuizContext';
import Button from '../ui/Button';
import ResultsSummary from './ResultsSummary';
import ReviewCard from './ReviewCard';

export default function ResultsScreen() {
  const { quiz, results, retake, startOver } = useQuiz();

  return (
    <div className="animate-screen-in mx-auto w-full max-w-2xl px-4 pb-32 pt-10 sm:pt-16">
      <p className="mb-2 text-sm font-medium text-slate-500">{quiz.title}</p>

      <ResultsSummary score={results.score} total={results.total} />

      <h2 className="mb-4 mt-10 text-lg font-bold tracking-tight text-slate-900">
        Question review
      </h2>

      <div className="space-y-4">
        {results.results.map((result, index) => (
          <ReviewCard key={result.questionId} result={result} index={index} />
        ))}
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button size="lg" onClick={retake} className="flex-1">
          Retake quiz
        </Button>
        <Button size="lg" variant="secondary" onClick={startOver} className="flex-1">
          New quiz
        </Button>
      </div>
    </div>
  );
}
