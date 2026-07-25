export function FilterSelect({
  value,
  onChange,
  label,
  options,
  optionLabels,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: string[];
  optionLabels?: Record<string, string>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-champagne"
    >
      <option value="all">{label}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {optionLabels?.[o] ?? o}
        </option>
      ))}
    </select>
  );
}
