import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, FileText, PenLine } from "lucide-react";
import { PropertyForm } from "@/components/admin/PropertyForm";
import { emptyPropertyForm, type PropertyFormValues } from "@/lib/property-schema";
import { submitPropertyForReview } from "@/api/functions/developer-properties.functions";
import {
  getBrochureExtraction,
  recordExtractionCorrections,
  type ExtractionCorrection,
} from "@/api/functions/brochure-extract.functions";
import { BrochureUploadStep } from "./BrochureUploadStep";
import { ExtractedFieldsReview } from "./ExtractedFieldsReview";
import { BrochureImagePicker } from "./BrochureImagePicker";
import { ResumeJobPicker } from "./ResumeJobPicker";
import {
  extractedFieldList,
  mapExtractedPayload,
  type ExtractionResponse,
} from "@/lib/brochure-field-mapping";
import { clearReviewProgress } from "@/lib/brochure-review-storage";

/** What a reviewer actually changed between the OCR draft and what they
 *  finally submitted — Phase 4(e)'s learning loop. Only scalar, OCR-sourced
 *  fields are compared; per-variant/room fields aren't in PropertyFormValues
 *  under the same key and are left for a later pass. */
function diffExtractionCorrections(
  response: ExtractionResponse,
  ocrDefaults: PropertyFormValues,
  finalValues: PropertyFormValues,
): ExtractionCorrection[] {
  const corrections: ExtractionCorrection[] = [];
  for (const field of extractedFieldList(response)) {
    const extractedValue = ocrDefaults[field.formField];
    const finalValue = finalValues[field.formField];
    if (finalValue == null || String(finalValue).trim() === "") continue;
    if (String(finalValue).trim() === String(extractedValue ?? "").trim()) continue;
    corrections.push({
      field: field.formField,
      corrected: String(finalValue).trim(),
      extracted: field.value ? field.value : null,
      page: field.sourcePage ?? null,
    });
  }
  return corrections;
}

type Step = "choose" | "upload" | "review" | "images" | "form";

/** New-property flow: manual entry or brochure OCR, both ending on the same
 *  form, both ending in a submission the owner has to approve before it's
 *  live. */
export function AddPropertyFlow() {
  const [step, setStep] = useState<Step>("choose");
  const [extraction, setExtraction] = useState<ExtractionResponse | null>(null);
  const [formDefaults, setFormDefaults] = useState<PropertyFormValues | undefined>(undefined);
  const [showResume, setShowResume] = useState(false);
  const navigate = useNavigate();
  const getExtractionFn = useServerFn(getBrochureExtraction);
  const recordCorrectionsFn = useServerFn(recordExtractionCorrections);

  const resumeMutation = useMutation({
    mutationFn: (jobId: string) => getExtractionFn({ data: { jobId } }),
    onSuccess: (result) => {
      setExtraction(result);
      setStep("review");
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't load that job"),
  });

  const submitMutation = useMutation({
    mutationFn: (values: PropertyFormValues) => {
      // Best-effort, fire-and-forget: this feeds the learning loop for this
      // developer's NEXT brochure, not this submission, so it must never
      // slow down or fail the actual "Submit for review" action.
      if (extraction && formDefaults) {
        const corrections = diffExtractionCorrections(extraction, formDefaults, values);
        if (corrections.length) {
          void recordCorrectionsFn({ data: { jobId: extraction.job_id, corrections } }).catch(
            () => {},
          );
        }
      }
      return submitPropertyForReview({
        data: { action: "create", jobId: extraction?.job_id, values },
      });
    },
    onSuccess: () => {
      if (extraction) clearReviewProgress(extraction.job_id);
      toast.success("Submitted — your admin will review it shortly.");
      navigate({ to: "/developer" });
    },
    onError: (e: Error) => toast.error(e.message || "Could not submit"),
  });

  if (step === "choose") {
    return (
      <div className="max-w-xl">
        <div className="grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setStep("form")}
            className="hover-lift flex flex-col items-center gap-3 rounded-2xl border border-(--rule) bg-card p-8 text-center shadow-(--shadow-lift) transition-colors hover:border-champagne/40 focus-visible:ring-2 focus-visible:ring-champagne/50 focus-visible:outline-none"
          >
            <span className="grid h-12 w-12 place-items-center rounded-full bg-champagne/12 text-champagne">
              <PenLine className="h-6 w-6" />
            </span>
            <div>
              <p className="font-medium text-foreground">Fill in manually</p>
              <p className="mt-1 text-xs text-muted-foreground">Type in every detail yourself.</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setStep("upload")}
            className="hover-lift flex flex-col items-center gap-3 rounded-2xl border border-(--rule) bg-card p-8 text-center shadow-(--shadow-lift) transition-colors hover:border-champagne/40 focus-visible:ring-2 focus-visible:ring-champagne/50 focus-visible:outline-none"
          >
            <span className="grid h-12 w-12 place-items-center rounded-full bg-champagne/12 text-champagne">
              <FileText className="h-6 w-6" />
            </span>
            <div>
              <p className="font-medium text-foreground">Upload brochure</p>
              <p className="mt-1 text-xs text-muted-foreground">
                We'll pull out what we can find; you fill in the rest.
              </p>
            </div>
          </button>
        </div>

        {/* Loads a brochure that was already extracted (its job was already
         *  assigned to this account at upload time) straight into review —
         *  no re-upload, no repeat LLM cost, and no job id to type or
         *  remember. */}
        <div className="mt-4">
          {showResume ? (
            <ResumeJobPicker
              onSelect={(jobId) => resumeMutation.mutate(jobId)}
              disabled={resumeMutation.isPending}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowResume(true)}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Resume a previous extraction
            </button>
          )}
          {resumeMutation.isPending && (
            <p className="mt-2 text-xs text-muted-foreground">Loading…</p>
          )}
        </div>
      </div>
    );
  }

  if (step === "upload") {
    return (
      <BrochureUploadStep
        onExtracted={(result) => {
          setExtraction(result);
          setStep("review");
        }}
        onCancel={() => setStep("choose")}
      />
    );
  }

  if (step === "review" && extraction) {
    return (
      <ExtractedFieldsReview
        response={extraction}
        onCancel={() => setStep("upload")}
        onContinue={(partial, selection, overrides) => {
          setFormDefaults({
            ...emptyPropertyForm(),
            ...mapExtractedPayload(extraction.extraction, overrides, selection),
            ...partial,
          });
          setStep("images");
        }}
      />
    );
  }

  if (step === "images" && extraction) {
    return (
      <BrochureImagePicker
        response={extraction}
        propertyName={formDefaults?.name ?? ""}
        onCancel={() => setStep("review")}
        onContinue={(images) => {
          setFormDefaults((prev) => ({ ...(prev ?? emptyPropertyForm()), ...images }));
          setStep("form");
        }}
      />
    );
  }

  // Whichever path got here, there has to be a way back out — otherwise a
  // developer who picked the wrong option is stuck with a full blank form.
  const backTo: Step = extraction ? "images" : "choose";

  return (
    <div>
      <button
        type="button"
        onClick={() => setStep(backTo)}
        className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-(--rule-strong) px-4 py-2 text-[11px] font-semibold tracking-luxury text-foreground uppercase transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-champagne/40 focus-visible:outline-none"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {extraction ? "Back to photos" : "Back"}
      </button>
      <PropertyForm
        defaultValues={formDefaults}
        submitLabel="Submit for review"
        hidePublishToggle
        submitting={submitMutation.isPending}
        onSubmit={(values) => submitMutation.mutate(values)}
      />
    </div>
  );
}
