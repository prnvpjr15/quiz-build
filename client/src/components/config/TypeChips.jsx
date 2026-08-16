import { QUESTION_TYPES } from '../../lib/questionTypes';

const CheckIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0" aria-hidden="true">
    <path
      fillRule="evenodd"
      d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
      clipRule="evenodd"
    />
  </svg>
);

// Multi-select checkboxes. "Mixed" is exclusive: picking it clears the rest,
// and picking any specific type clears it, because "mixed plus true/false" has
// no coherent meaning.
export default function TypeChips({ value, onChange }) {
  function toggle(id) {
    if (id === 'mixed') {
      onChange(value.includes('mixed') ? [] : ['mixed']);
      return;
    }

    const withoutMixed = value.filter((item) => item !== 'mixed');

    onChange(
      withoutMixed.includes(id)
        ? withoutMixed.filter((item) => item !== id)
        : [...withoutMixed, id]
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {QUESTION_TYPES.map((type) => {
        const selected = value.includes(type.id);

        return (
          <label
            key={type.id}
            className={`flex cursor-pointer items-start gap-3 rounded-xl p-3.5 text-left ring-1 transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-600 has-[:focus-visible]:ring-offset-2 ${
              selected
                ? 'bg-accent-50 ring-accent-200'
                : 'bg-white ring-slate-200 hover:bg-slate-50 hover:ring-slate-300'
            }`}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={() => toggle(type.id)}
              className="sr-only"
            />
            <span
              className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md ring-1 transition-colors duration-150 ${
                selected ? 'bg-accent-600 text-white ring-accent-600' : 'bg-white ring-slate-300'
              }`}
              aria-hidden="true"
            >
              {selected && <CheckIcon />}
            </span>
            <span className="min-w-0">
              <span
                className={`block text-sm font-semibold ${selected ? 'text-accent-700' : 'text-slate-800'}`}
              >
                {type.label}
              </span>
              <span className="block text-xs text-slate-500">{type.hint}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
