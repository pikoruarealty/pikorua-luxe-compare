import { useState } from "react";
import { FileUp, X } from "lucide-react";
import { BrochureUploadStep } from "./BrochureUploadStep";
import { ExtractedFieldsReview } from "./ExtractedFieldsReview";
import {
  mapExtractedPayload,
  mergeReviewedExtraction,
  type ExtractionResponse,
} from "@/lib/brochure-field-mapping";
import type { PropertyFormValues } from "@/lib/property-schema";

/** The edit flow deliberately uses the same cited-value reviewer as adding a
 * property. A saved value that differs starts unchecked in that reviewer, so
 * this panel only applies decisions the user has actually made. */
export function BrochureEnrichPanel({
  current,
  onApply,
}: {
  current: PropertyFormValues;
  onApply: (merged: PropertyFormValues, jobId: string) => void;
}) {
  const [step, setStep] = useState<"idle" | "upload" | "review">("idle");
  const [extraction, setExtraction] = useState<ExtractionResponse | null>(null);

  const reset = () => {
    setStep("idle");
    setExtraction(null);
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

  if (step === "review" && extraction) {
    return (
      <ExtractedFieldsReview
        response={extraction}
        existingValues={current}
        onCancel={() => setStep("upload")}
        onContinue={(partial, selection, overrides) => {
          const reviewed = {
            ...mapExtractedPayload(extraction.extraction, overrides, selection),
            ...partial,
          };
          onApply(mergeReviewedExtraction(current, reviewed), extraction.job_id);
          reset();
        }}
      />
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
            Upload a brochure, RERA certificate or price list. You will check each cited value on
            the same review screen used when adding a property.
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
      <BrochureUploadStep
        onExtracted={(result) => {
          setExtraction(result);
          setStep("review");
        }}
        onCancel={reset}
      />
    </div>
  );
}
