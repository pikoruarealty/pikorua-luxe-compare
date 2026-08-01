import { useMemo, useState } from "react";
import { FileUp, X } from "lucide-react";
import { BrochureUploadStep } from "./BrochureUploadStep";
import {
  extractedFieldList,
  mapExtractedPayload,
  type ExtractionResponse,
} from "@/lib/brochure-field-mapping";
import type { PropertyFormValues } from "@/lib/property-schema";

type Row = {
  key: string;
  label: string;
  current: string;
  incoming: string;
  /** A blank field is a gap to fill; a different value is a conflict to decide. */
  conflict: boolean;
  apply: (into: PropertyFormValues) => void;
};

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

  const rows = useMemo<Row[]>(() => {
    if (!extraction) return [];
    const out: Row[] = [];

    for (const f of extractedFieldList(extraction)) {
      const existing = String(
        (current as unknown as Record<string, unknown>)[f.formField] ?? "",
      ).trim();
      if (existing === f.value) continue;
      out.push({
        key: f.formField,
        label: f.label,
        current: existing,
        incoming: f.value,
        conflict: existing !== "",
        apply: (into) => {
          (into as unknown as Record<string, unknown>)[f.formField] = f.value;
        },
      });
    }

    const mapped = mapExtractedPayload(extraction.extraction);

    const incomingAmenities = mapped.amenities ?? [];
    if (incomingAmenities.length) {
      const existing = current.amenities ?? [];
      const fresh = incomingAmenities.filter((a) => !existing.includes(a));
      if (fresh.length) {
        out.push({
          key: "__amenities",
          label: `Amenities — ${fresh.length} new`,
          current: existing.length ? `${existing.length} already listed` : "none",
          incoming: fresh.join(" · "),
          // Adding to a list never destroys anything, so this is a gap, not a clash.
          conflict: false,
          apply: (into) => {
            into.amenities = [...existing, ...fresh];
          },
        });
      }
    }

    const incomingConfigs = mapped.configs;
    if (incomingConfigs) {
      const counts = Object.entries(incomingConfigs)
        .filter(([, v]) => v.length > 0)
        .map(([k, v]) => `${k}: ${v.length}`)
        .join(", ");
      const existingCount = Object.values(current.configs ?? {}).reduce(
        (n, v) => n + (v?.length ?? 0),
        0,
      );
      if (counts) {
        out.push({
          key: "__configs",
          label: "Configurations",
          current: existingCount ? `${existingCount} variant(s) already saved` : "none",
          incoming: counts,
          // Variant arrays can't be merged safely — matching "Type A" across two
          // sources is guesswork — so this is all-or-nothing and off by default.
          conflict: existingCount > 0,
          apply: (into) => {
            into.configs = incomingConfigs as PropertyFormValues["configs"];
          },
        });
      }
    }

    return out;
  }, [extraction, current]);

  const reset = () => {
    setStep("idle");
    setExtraction(null);
    setChosen({});
  };

  const handleExtracted = (result: ExtractionResponse) => {
    setExtraction(result);
    // Gaps are pre-ticked because filling a blank can't lose anything; conflicts
    // start off, so overwriting saved data is always a deliberate choice.
    const list = extractedFieldList(result);
    const pre: Record<string, boolean> = {};
    for (const f of list) {
      const existing = String(
        (current as unknown as Record<string, unknown>)[f.formField] ?? "",
      ).trim();
      if (existing === "") pre[f.formField] = true;
    }
    pre.__amenities = true;
    setChosen(pre);
    setStep("merge");
  };

  const applySelected = () => {
    const merged = structuredClone(current);
    for (const row of rows) if (chosen[row.key]) row.apply(merged);
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

      {step === "upload" && (
        <BrochureUploadStep onExtracted={handleExtracted} onCancel={reset} />
      )}

      {step === "merge" && (
        <>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing new — everything the brochure mentions already matches what's saved.
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => {
                const on = Boolean(chosen[row.key]);
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
                  {rows.filter((r) => chosen[r.key]).length} of {rows.length} selected
                </span>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
