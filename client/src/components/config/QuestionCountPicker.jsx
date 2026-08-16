import { QUESTION_COUNT } from '../../lib/questionTypes';

const StepButton = ({ label, onClick, disabled, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-600 ring-1 ring-slate-200 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-900 disabled:text-slate-300 disabled:hover:bg-white"
  >
    {children}
  </button>
);

// Slider and stepper drive the same value: the slider is faster on touch, the
// stepper is precise, and the number input keeps it typeable and keyboard
// accessible.
export default function QuestionCountPicker({ value, onChange }) {
  const { min, max } = QUESTION_COUNT;
  const clamp = (next) => Math.min(max, Math.max(min, next));
  const percent = ((value - min) / (max - min)) * 100;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <StepButton label="Fewer questions" onClick={() => onChange(clamp(value - 1))} disabled={value <= min}>
          <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden="true">
            <path d="M4 10a1 1 0 0 1 1-1h10a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Z" />
          </svg>
        </StepButton>

        <label className="sr-only" htmlFor="question-count">
          Number of questions
        </label>
        <input
          id="question-count"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (!Number.isNaN(next)) onChange(clamp(next));
          }}
          className="w-16 rounded-lg bg-white py-1.5 text-center text-lg font-bold text-slate-900 tabular-nums ring-1 ring-slate-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />

        <StepButton label="More questions" onClick={() => onChange(clamp(value + 1))} disabled={value >= max}>
          <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden="true">
            <path d="M10 4a1 1 0 0 1 1 1v4h4a1 1 0 1 1 0 2h-4v4a1 1 0 1 1-2 0v-4H5a1 1 0 1 1 0-2h4V5a1 1 0 0 1 1-1Z" />
          </svg>
        </StepButton>

        <span className="text-sm text-slate-500">questions</span>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label="Number of questions"
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 [&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-accent-600 [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-600 [&::-webkit-slider-thumb]:shadow"
        style={{
          background: `linear-gradient(to right, var(--color-accent-600) ${percent}%, var(--color-slate-200) ${percent}%)`,
        }}
      />

      <div className="flex justify-between text-xs text-slate-400 tabular-nums">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
