// Groups of related controls are real fieldsets so screen readers announce the
// group label before the individual options.
export default function Field({ label, hint, htmlFor, as = 'div', children }) {
  const isFieldset = as === 'fieldset';
  const Tag = isFieldset ? 'fieldset' : 'div';
  const LabelTag = isFieldset ? 'legend' : 'label';

  return (
    <Tag className="space-y-3">
      <div className={isFieldset ? 'contents' : ''}>
        <LabelTag
          htmlFor={isFieldset ? undefined : htmlFor}
          className="block text-sm font-semibold text-slate-900"
        >
          {label}
        </LabelTag>
        {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
      </div>
      {children}
    </Tag>
  );
}
