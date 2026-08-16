import { useEffect, useState } from 'react';
import Card from '../ui/Card';

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function headline(percent) {
  if (percent === 100) return 'Perfect score';
  if (percent >= 80) return 'Strong result';
  if (percent >= 60) return 'Solid effort';
  if (percent >= 40) return 'Worth another pass';
  return 'Room to grow';
}

export default function ResultsSummary({ score, total }) {
  const percent = total > 0 ? Math.round((score / total) * 100) : 0;

  // Animates from empty on mount so the ring reads as a result being revealed
  // rather than a static figure.
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setProgress(percent));
    return () => cancelAnimationFrame(frame);
  }, [percent]);

  const tone =
    percent >= 80 ? 'text-correct-600' : percent >= 50 ? 'text-accent-600' : 'text-wrong-600';

  return (
    <Card className="flex flex-col items-center gap-6 text-center sm:flex-row sm:text-left">
      <div className="relative shrink-0">
        <svg viewBox="0 0 120 120" className="size-32 -rotate-90" aria-hidden="true">
          <circle
            cx="60"
            cy="60"
            r={RADIUS}
            fill="none"
            strokeWidth="10"
            className="stroke-slate-100"
          />
          <circle
            cx="60"
            cy="60"
            r={RADIUS}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE - (progress / 100) * CIRCUMFERENCE}
            className={`${tone} transition-[stroke-dashoffset] duration-1000 ease-out`}
            style={{ stroke: 'currentColor' }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-bold tabular-nums ${tone}`}>{percent}%</span>
        </div>
      </div>

      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{headline(percent)}</h1>
        <p className="mt-1.5 text-base text-slate-600 tabular-nums">
          <span className="font-semibold text-slate-900">
            {score}/{total}
          </span>{' '}
          correct
        </p>
        <p className="mt-3 text-sm text-slate-500">
          Review each question below to see what you missed and why.
        </p>
      </div>
    </Card>
  );
}
