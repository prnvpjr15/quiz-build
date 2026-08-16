import { TIME_LIMIT_OPTIONS } from '../../lib/questionTypes';

export default function TimeLimitToggle({ enabled, minutes, onToggle, onMinutesChange }) {
  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer items-center justify-between gap-4">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-slate-900">Time limit</span>
          <span className="block text-sm text-slate-500">
            Submits automatically when the clock runs out
          </span>
        </span>

        <span className="relative inline-flex shrink-0 items-center">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => onToggle(event.target.checked)}
            className="peer sr-only"
          />
          <span className="block h-6 w-11 rounded-full bg-slate-200 transition-colors duration-200 peer-checked:bg-accent-600 peer-focus-visible:ring-2 peer-focus-visible:ring-accent-600 peer-focus-visible:ring-offset-2" />
          <span className="pointer-events-none absolute left-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200 peer-checked:translate-x-5" />
        </span>
      </label>

      {/* Kept mounted and collapsed so toggling does not jump the layout. */}
      <div
        className={`grid transition-all duration-300 ${
          enabled ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="flex flex-wrap gap-2 pt-1">
            {TIME_LIMIT_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onMinutesChange(option)}
                tabIndex={enabled ? 0 : -1}
                aria-pressed={minutes === option}
                className={`rounded-lg px-3.5 py-2 text-sm font-semibold ring-1 transition-colors duration-150 ${
                  minutes === option
                    ? 'bg-accent-50 text-accent-700 ring-accent-200'
                    : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
                }`}
              >
                {option} min
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
