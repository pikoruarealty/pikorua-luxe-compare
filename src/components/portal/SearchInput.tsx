import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/** Portal search field with a leading icon and the brand focus ring. Shared by
 *  the properties and customers tables so the toolbar reads the same everywhere. */
export function SearchInput({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative w-full max-w-xs", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-(--rule-strong) bg-background py-2.5 pr-3 pl-9 text-sm text-foreground outline-none transition-colors focus:border-champagne focus:ring-2 focus:ring-champagne/30"
      />
    </div>
  );
}
