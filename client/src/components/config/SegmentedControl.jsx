// A single-choice control built from real radios: the visible pill is styled
// from :checked and :focus-visible, so arrow-key navigation and screen-reader
// semantics come free instead of being reimplemented on buttons.
export default function SegmentedControl({ name, options, value, onChange }) {
  return (
    <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-slate-100 p-1.5">
      {options.map((option) => (
        <label
          key={option.id}
          className="relative cursor-pointer rounded-lg text-center has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-600 has-[:focus-visible]:ring-offset-2"
        >
          <input
            type="radio"
            name={name}
            value={option.id}
            checked={value === option.id}
            onChange={() => onChange(option.id)}
            className="sr-only"
          />
          <span
            className={`block rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-150 ${
              value === option.id
                ? 'bg-white text-accent-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {option.label}
          </span>
        </label>
      ))}
    </div>
  );
}
