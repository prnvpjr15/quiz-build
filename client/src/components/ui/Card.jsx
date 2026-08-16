// Structure comes from a hairline ring and a soft shadow rather than borders
// and dividers, which keeps long scrollable lists calm.
export default function Card({ as: Tag = 'div', className = '', children, ...props }) {
  return (
    <Tag
      className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70 sm:p-6 ${className}`}
      {...props}
    >
      {children}
    </Tag>
  );
}
