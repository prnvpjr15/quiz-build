import Timer from './Timer';

// Sticks below the top of the viewport while the list scrolls, so the count
// and the timer stay visible without stealing much vertical space.
export default function ProgressTracker({ answered, total, title, timeLimitMinutes, onExpire }) {
  const percent = total > 0 ? (answered / total) * 100 : 0;

  return (
    <div className="sticky top-0 z-20 border-b border-slate-200/70 bg-slate-50/85 backdrop-blur-md">
      <div className="mx-auto w-full max-w-2xl px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
            <p className="text-xs text-slate-500 tabular-nums" aria-live="polite">
              {answered}/{total} answered
            </p>
          </div>

          {timeLimitMinutes && <Timer minutes={timeLimitMinutes} onExpire={onExpire} />}
        </div>

        <div
          className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-valuenow={answered}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label="Questions answered"
        >
          <div
            className="h-full rounded-full bg-accent-600 transition-[width] duration-300 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
