import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { generateQuiz, submitQuiz } from '../lib/quizApi';
import { isAnswered } from '../lib/questionTypes';

// One provider holds the whole flow: which screen is showing, the generated
// quiz, and the in-progress answers. useState is enough — the state is small
// and the transitions between screens are linear, so a reducer or an external
// store would add ceremony without removing any complexity.
const QuizContext = createContext(null);

export const SCREENS = {
  CONFIG: 'config',
  QUIZ: 'quiz',
  RESULTS: 'results',
};

export function QuizProvider({ children }) {
  const [screen, setScreen] = useState(SCREENS.CONFIG);
  const [config, setConfig] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [results, setResults] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const answerQuestion = useCallback((questionId, value) => {
    setAnswers((previous) => ({ ...previous, [questionId]: value }));
  }, []);

  const generate = useCallback(async (nextConfig) => {
    setIsGenerating(true);
    setError(null);

    try {
      const generated = await generateQuiz(nextConfig);

      setConfig(nextConfig);
      setQuiz(generated);
      setAnswers({});
      setResults(null);
      setScreen(SCREENS.QUIZ);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const submit = useCallback(async () => {
    if (!quiz) return;

    setIsSubmitting(true);

    try {
      setResults(await submitQuiz(quiz, answers));
      setScreen(SCREENS.RESULTS);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }, [quiz, answers]);

  // Same questions, cleared answers — the point of retaking is to try again on
  // the material you just got wrong.
  const retake = useCallback(() => {
    setAnswers({});
    setResults(null);
    setScreen(SCREENS.QUIZ);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const startOver = useCallback(() => {
    setQuiz(null);
    setAnswers({});
    setResults(null);
    setError(null);
    setScreen(SCREENS.CONFIG);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const answeredCount = useMemo(
    () => (quiz ? quiz.questions.filter((q) => isAnswered(answers[q.id])).length : 0),
    [quiz, answers]
  );

  const value = useMemo(
    () => ({
      screen,
      config,
      quiz,
      answers,
      results,
      error,
      isGenerating,
      isSubmitting,
      answeredCount,
      totalQuestions: quiz?.questions.length ?? 0,
      allAnswered: quiz ? answeredCount === quiz.questions.length : false,
      answerQuestion,
      generate,
      submit,
      retake,
      startOver,
    }),
    [
      screen, config, quiz, answers, results, error, isGenerating, isSubmitting,
      answeredCount, answerQuestion, generate, submit, retake, startOver,
    ]
  );

  return <QuizContext.Provider value={value}>{children}</QuizContext.Provider>;
}

export function useQuiz() {
  const context = useContext(QuizContext);
  if (!context) throw new Error('useQuiz must be used inside a QuizProvider');

  return context;
}
