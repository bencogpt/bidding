import { useState } from 'react';

// Free-text tag chips: type + Enter/comma to add, ✕ to remove.
export default function TagsInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    const t = raw.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setDraft('');
  };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-paper-2 bg-surface p-2">
      {value.map((tag) => (
        <span key={tag} className="chip flex items-center gap-1">
          {tag}
          <button type="button" className="text-red-600" onClick={() => onChange(value.filter((x) => x !== tag))}>
            ✕
          </button>
        </span>
      ))}
      <input
        className="min-w-24 flex-1 bg-transparent text-sm outline-none"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add(draft);
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => draft && add(draft)}
      />
    </div>
  );
}
