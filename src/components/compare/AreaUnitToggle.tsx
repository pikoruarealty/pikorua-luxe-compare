import { AREA_UNIT_OPTIONS } from "@/lib/area-units";
import { useAreaUnitStore } from "@/stores/area-unit-store";

export function AreaUnitToggle({ className = "" }: { className?: string }) {
  const unit = useAreaUnitStore((s) => s.unit);
  const setUnit = useAreaUnitStore((s) => s.setUnit);

  return (
    <div className={`inline-flex flex-wrap items-center gap-2 ${className}`}>
      <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        Show areas in
      </span>
      <div className="inline-flex rounded-full border border-border-strong bg-muted/30 p-0.5">
        {AREA_UNIT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setUnit(opt.value)}
            aria-pressed={unit === opt.value}
            className={`rounded-full px-3.5 py-1.5 min-h-[32px] text-xs font-medium touch-manipulation transition-all active:scale-95 ${
              unit === opt.value
                ? "bg-foreground text-background shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.shortLabel}
          </button>
        ))}
      </div>
      <span className="text-[10px] text-muted-foreground">
        Room dimensions always show in ft/in
      </span>
    </div>
  );
}
