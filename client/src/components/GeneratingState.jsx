import { useEffect, useState } from 'react';
import Card from './ui/Card';

// Rotating status lines: generation takes a few seconds, and a message that
// changes is the difference between "working" and "frozen".
const STATUSES = [
  'Reading up on your topic…',
  'Drafting questions…',
  'Checking the answer keys…',
  'Almost there…',
];

const SkeletonQuestion = ({ delay }) => (
  <Card className="animate-rise" style={{ animationDelay: `${delay}ms` }}>
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="size-7 rounded-lg bg-slate-100" />
        <div className="h-3 w-20 rounded-full bg-slate-100" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-full rounded-full bg-slate-100" />
        <div className="h-4 w-3/5 rounded-full bg-slate-100" />
      </div>
      <div className="space-y-2 pt-1">
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-11 rounded-xl bg-slate-50 ring-1 ring-slate-100" />
        ))}
      </div>
    </div>
  </Card>
);

export default function GeneratingState({ topic }) {
  const [statusIndex, setStatusIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setStatusIndex((index) => (index + 1) % STATUSES.length),
      1100
    );

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="animate-screen-in mx-auto w-full max-w-2xl px-4 py-10 sm:py-16">
      <div className="mb-8 flex flex-col items-center text-center">
        <span
          className="mb-5 size-8 animate-spin rounded-full border-[3px] border-slate-200 border-t-accent-600"
          aria-hidden="true"
        />
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Building your quiz
        </h1>
        {topic && <p className="mt-1.5 text-base text-slate-500">on {topic}</p>}

        {/* Politely announced, so the change is available without sight. */}
        <p role="status" aria-live="polite" className="mt-4 text-sm font-medium text-accent-700">
          {STATUSES[statusIndex]}
        </p>
      </div>

      <div className="space-y-4 opacity-60" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <SkeletonQuestion key={index} delay={index * 90} />
        ))}
      </div>
    </div>
  );
}
