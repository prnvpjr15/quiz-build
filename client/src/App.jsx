import { QuizProvider, SCREENS, useQuiz } from './context/QuizContext';
import ConfigForm from './components/config/ConfigForm';
import GeneratingState from './components/GeneratingState';
import QuizScreen from './components/quiz/QuizScreen';
import ResultsScreen from './components/results/ResultsScreen';

// Screens swap in place with a keyed mount, so each entrance animation runs
// once and there is never a page reload between steps.
function Screens() {
  const { screen, isGenerating, config } = useQuiz();

  if (isGenerating) return <GeneratingState topic={config?.topic} />;

  switch (screen) {
    case SCREENS.QUIZ:
      return <QuizScreen key="quiz" />;
    case SCREENS.RESULTS:
      return <ResultsScreen key="results" />;
    default:
      return <ConfigForm key="config" />;
  }
}

export default function App() {
  return (
    <QuizProvider>
      <main className="min-h-dvh">
        <Screens />
      </main>
    </QuizProvider>
  );
}
