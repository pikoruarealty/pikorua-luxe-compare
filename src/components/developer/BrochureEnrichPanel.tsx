import { useMemo, useState } from "react";
import { FileUp, X } from "lucide-react";
import { BrochureUploadStep } from "./BrochureUploadStep";
import {
  buildMergeRows,
  findMappingGaps,
  type ExtractionResponse,
  type MergeRow,
} from "@/lib/brochure-field-mapping";
import {
  CONFIG_BUCKETS,
  emptyPropertyForm,
  type PropertyFormValues,
} from "@/lib/property-schema";

/** Lets an existing property be topped up from a brochure: whatever is still
 *  blank gets filled, and anything that disagrees with what's already saved has
 *  to be explicitly replaced. Used from both the admin and developer edit
 *  screens, since either may receive a brochure after the listing exists. */
export function BrochureEnrichPanel({
  current,
  onApply,
}: {
  current: PropertyFormValues;
  onApply: (merged: PropertyFormValues) => void;
}) {
  const [step, setStep] = useState<"idle" | "upload" | "merge">("idle");
  const [extraction, setExtraction] = useState<ExtractionResponse | null>(null);
  const [chosen, setChosen] = useState<Record<string, boolean>>({});

  const rows = useMemo<MergeRow[]>(
    () => (extraction ? buildMergeRows(current, extraction) : []),
    [extraction, current],
  );

  // What the brochure contained that this form has no home for. Shown rather
  // than swallowed: a plan book using conventions the mapping doesn't know
  // produces a thin listing that looks exactly like a thin brochure, and the
  // difference was only ever noticed weeks later by someone reading the form.
  const gaps = useMemo(
    () => (extraction ? findMappingGaps(extraction.extraction) : null),
    [extraction],
  );

  /** What the extractor itself flagged while reading — a carpet area that is
   *  2% of its built-up, a figure absent from the snippet it was quoted from.
   *  The add-property screen has always shown these; this one did not, which
   *  is exactly where a wrong area got through. Room-size warnings run to
   *  dozens on a big plan book, so the area ones lead. */
  const serviceWarnings = useMemo(() => {
    const all = extraction?.extraction.warnings ?? [];
    const areas = all.filter((w) => /area/i.test(w) && !/printed on that page/i.test(w));
    return (areas.length ? areas : all).slice(0, 8);
  }, [extraction]);

  const reset = () => {
    setStep("idle");
    setExtraction(null);
    setChosen({});
  };

  const handleExtracted = (result: ExtractionResponse) => {
    setExtraction(result);
    setChosen({});
    setStep("merge");
  };

  /** Gaps default to ticked because filling a blank can't lose anything;
   *  conflicts default to off, so overwriting saved data is always a deliberate
   *  choice. `chosen` only ever holds what the reviewer actually changed. */
  const isOn = (row: MergeRow) => chosen[row.key] ?? !row.conflict;

  const applySelected = () => {
    const merged = structuredClone(current);
    // Taken from the form's own empty value so a new bucket added to
    // CONFIG_BUCKETS can never be missed here.
    merged.configs = merged.configs ?? emptyPropertyForm().configs;
    for (const row of rows) if (isOn(row)) row.apply(merged);
    onApply(merged);
    reset();
  };

  if (step === "idle") {
    return (
      <button
        type="button"
        onClick={() => setStep("upload")}
        className="inline-flex items-center gap-2 rounded-full border border-(--rule-strong) px-4 py-2 text-[11px] font-semibold tracking-luxury text-foreground uppercase transition-colors hover:border-champagne focus-visible:ring-2 focus-visible:ring-champagne/40 focus-visible:outline-none"
      >
        <FileUp className="h-3.5 w-3.5" /> Fill from brochure
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-(--rule) bg-card p-4 shadow-(--shadow-lift)">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="font-label text-[11px] font-semibold tracking-luxury text-champagne uppercase">
            Fill from brochure
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {step === "upload"
              ? "Upload a brochure, RERA certificate or price list — we'll read what's in it."
              : "Blanks are ticked for you. Anything that disagrees with saved data is left off until you choose to replace it."}
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          aria-label="Close"
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {step === "upload" && <BrochureUploadStep onExtracted={handleExtracted} onCancel={reset} />}

      {step === "merge" && (
        <>
          {gaps &&
            (gaps.droppedVariants.length > 0 ||
              gaps.bedroomShortfall.length > 0 ||
              gaps.unparsedDimensions.length > 0 ||
              serviceWarnings.length > 0) && (
              <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
                <p className="font-label text-[10px] font-semibold tracking-luxury text-amber-700 uppercase dark:text-amber-400">
                  Read from the brochure but not filled in
                </p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {gaps.droppedVariants.map((v) => (
                    <li key={v.label}>
                      <span className="text-foreground">{v.label}</span> — {v.rooms} rooms;{" "}
                      {v.stated
                        ? `a ${v.bhkType}, and this form holds only ${CONFIG_BUCKETS.map((b) => b.label).join(", ")}.`
                        : "we couldn't tell what size this layout is, so it has to be entered by hand."}
                    </li>
                  ))}
                  {gaps.bedroomShortfall.map((s) => (
                    <li key={`short-${s.variant}`}>
                      <span className="text-foreground">{s.variant}</span> — the sheet says{" "}
                      {s.stated} BHK but only {s.found} bedroom{s.found === 1 ? "" : "s"} could be
                      read off the plan. Check the remaining {s.stated - s.found} against the
                      brochure before saving.
                    </li>
                  ))}
                  {serviceWarnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                  {gaps.unparsedDimensions.length > 0 && (
                    <li>
                      {gaps.unparsedDimensions.length} room size(s) printed in a style we
                      couldn&apos;t read — they come through exactly as printed, without a sq ft
                      figure.
                    </li>
                  )}
                </ul>
              </div>
            )}

          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing new — everything the brochure mentions already matches what's saved.
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => {
                const on = isOn(row);
                return (
                  <label
                    key={row.key}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                      on ? "border-emerald-600/40 bg-emerald-600/5" : "border-(--rule)"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => setChosen((c) => ({ ...c, [row.key]: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-label text-[10px] font-semibold tracking-luxury text-muted-foreground uppercase">
                          {row.label}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            row.conflict
                              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                              : "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400"
                          }`}
                        >
                          {row.conflict ? "Replace?" : "Fills a blank"}
                        </span>
                      </span>
                      {row.conflict && (
                        <span className="mt-1 block text-xs text-muted-foreground line-through">
                          {row.current}
                        </span>
                      )}
                      <span className="mt-0.5 block text-sm break-words text-foreground">
                        {row.incoming}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-full border border-(--rule-strong) px-4 py-2 text-[11px] font-semibold tracking-luxury text-foreground uppercase transition-colors hover:border-foreground/30"
            >
              Cancel
            </button>
            {rows.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={applySelected}
                  className="foil rounded-full px-5 py-2 text-[11px] font-semibold tracking-luxury uppercase"
                >
                  Apply to form
                </button>
                <span className="text-xs text-muted-foreground">
                  {rows.filter(isOn).length} of {rows.length} selected
                </span>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
