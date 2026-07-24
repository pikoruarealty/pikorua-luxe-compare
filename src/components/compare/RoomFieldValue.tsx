import { formatArea, formatAreaNumber, unitLabel, type AreaUnit } from "@/lib/area-units";
import { convertLeadingSqFt, parseRoomAreaParts } from "@/lib/room-area-format";
import { useAreaUnitStore } from "@/stores/area-unit-store";

/** A bare numeric area string (ConfigDetail.area / .carpet) — e.g. "3,200". */
export function BareAreaValue({ value }: { value: string | null | undefined }) {
  const unit = useAreaUnitStore((s) => s.unit);
  if (!value) return null;
  const sqft = parseFloat(value.replace(/,/g, ""));
  if (!Number.isFinite(sqft)) return <>{value}</>;
  return <>{formatArea(sqft, unit)}</>;
}

/** A free-text room breakdown (livingArea / kitchen / bedroomN) — one or more
 *  "Label NNN sq ft (dims)" segments joined by " + ". Renders each segment on
 *  its own line with a summed total when it can be parsed cleanly; otherwise
 *  falls back to the original text (converting only a confidently-isolated
 *  leading total) rather than guessing at a wrong split. */
export function RoomFieldValue({ value }: { value: string | null | undefined }) {
  const unit = useAreaUnitStore((s) => s.unit);
  if (!value) return null;

  const parts = parseRoomAreaParts(value);
  if (!parts) {
    return <span>{convertLeadingSqFt(value, unit)}</span>;
  }
  if (parts.length === 1) {
    const { label, sqft, dims } = parts[0];
    return (
      <span>
        {label && <span className="font-medium">{label} </span>}
        <span className="whitespace-nowrap">{dims}</span> ({formatArea(sqft, unit)})
      </span>
    );
  }

  const total = parts.reduce((sum, p) => sum + p.sqft, 0);
  return (
    <div className="space-y-1 text-center">
      {parts.map((part, i) => (
        <p key={i} className="leading-snug">
          {part.label && <span className="font-medium">{part.label}</span>}
          {part.label ? " " : ""}
          <span className="whitespace-nowrap">{part.dims}</span> ({formatArea(part.sqft, unit)})
        </p>
      ))}
      <p className="mt-1 border-t border-border/60 pt-1 text-[11px] font-semibold text-foreground/70">
        {parts.map((p) => formatAreaNumber(p.sqft, unit)).join(" + ")} ={" "}
        {formatAreaNumber(total, unit)} {unitLabel(unit)}
      </p>
    </div>
  );
}

export type { AreaUnit };
