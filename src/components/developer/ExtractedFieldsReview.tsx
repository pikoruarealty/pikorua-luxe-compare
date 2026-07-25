import { useState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import type { ExtractedFieldInfo, ExtractionResponse } from "@/lib/brochure-field-mapping";
import type { PropertyFormValues } from "@/lib/property-schema";

function confidenceStyle(confidence: number): string {
  if (confidence >= 0.85) return "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400";
  if (confidence >= 0.6) return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return "bg-red-500/15 text-red-700 dark:text-red-400";
}

/** Step 2 of the OCR path — every field the extractor filled in, shown with
 *  its confidence and source, editable, and a required "Approve" checkbox
 *  (like a mandatory Google Forms field: not locked, but Continue won't work
 *  until every one is checked). */
export function ExtractedFieldsReview({
  response,
  fields,
  onContinue,
  onCancel,
}: {
  response: ExtractionResponse;
  fields: ExtractedFieldInfo[];
  onContinue: (
    values: Partial<PropertyFormValues>,
    approvedKeys: (keyof PropertyFormValues)[],
  ) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.formField, f.value])),
  );
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const [showError, setShowError] = useState(false);

  const unapproved = fields.filter((f) => !approved[f.formField]);

  const handleContinue = () => {
    if (unapproved.length > 0) {
      setShowError(true);
      return;
    }
    const partial = values as unknown as Partial<PropertyFormValues>;
    onContinue(
      partial,
      fields.map((f) => f.formField),
    );
  };

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-muted-foreground">
        Here's what we found. Check each one against the source snippet, fix anything wrong, then
        approve it — every field needs a tick before you can continue.
      </p>

      {response.missing_required.length > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-dashed border-[var(--rule-strong)] bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Not found in any file, fill these in yourself: {response.missing_required.join(", ")}
          </span>
        </div>
      )}
      {response.conflicts.length > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {response.conflicts.length} field{response.conflicts.length > 1 ? "s" : ""} disagreed
            across your files — the most confident value was kept. Double-check those below.
          </span>
        </div>
      )}

      <div className="mt-5 space-y-3">
        {fields.map((f) => {
          const isApproved = Boolean(approved[f.formField]);
          const needsAttention = showError && !isApproved;
          return (
            <div
              key={f.formField}
              className={`rounded-xl border p-4 transition-colors ${
                isApproved
                  ? "border-emerald-600/40 bg-emerald-600/5"
                  : needsAttention
                    ? "border-red-500/50"
                    : "border-[var(--rule)]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-label text-[10px] font-semibold tracking-luxury text-muted-foreground uppercase">
                      {f.label}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${confidenceStyle(f.confidence)}`}
                    >
                      {Math.round(f.confidence * 100)}% confident
                    </span>
                  </div>
                  <input
                    value={values[f.formField] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [f.formField]: e.target.value }))}
                    className="mt-2 w-full rounded-lg border border-[var(--rule-strong)] bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-champagne focus:ring-2 focus:ring-champagne/30"
                  />
                  {(f.snippet || f.sourceFile) && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      {f.snippet && <span>"{f.snippet}"</span>}
                      {f.sourceFile && (
                        <span>
                          {" "}
                          — {f.sourceFile}
                          {f.sourcePage ? ` p.${f.sourcePage}` : ""}
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 pt-1">
                  <input
                    type="checkbox"
                    checked={isApproved}
                    onChange={(e) =>
                      setApproved((a) => ({ ...a, [f.formField]: e.target.checked }))
                    }
                    className="h-4 w-4"
                  />
                  <span
                    className={`flex items-center gap-1 text-xs font-medium ${
                      isApproved
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    <Check className="h-3.5 w-3.5" /> Approve
                  </span>
                </label>
              </div>
            </div>
          );
        })}
      </div>

      {showError && unapproved.length > 0 && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">
          Approve all {unapproved.length} remaining field{unapproved.length > 1 ? "s" : ""} before
          continuing.
        </p>
      )}

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-[var(--rule-strong)] px-5 py-2.5 text-[11px] font-semibold tracking-luxury text-foreground uppercase transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-champagne/40 focus-visible:outline-none"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleContinue}
          className="foil rounded-full px-5 py-2.5 text-[11px] font-semibold tracking-luxury uppercase"
        >
          Continue to form
        </button>
      </div>
    </div>
  );
}
