import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, PenLine } from "lucide-react";
import { PropertyForm } from "@/components/admin/PropertyForm";
import { emptyPropertyForm, type PropertyFormValues } from "@/lib/property-schema";
import { submitPropertyForReview } from "@/lib/developer-properties.functions";
import { BrochureUploadStep } from "./BrochureUploadStep";
import { ExtractedFieldsReview } from "./ExtractedFieldsReview";
import {
  extractedFieldList,
  mapExtractedPayload,
  type ExtractionResponse,
} from "@/lib/brochure-field-mapping";

type Step = "choose" | "upload" | "review" | "form";

/** New-property flow: manual entry or brochure OCR, both ending on the same
 *  form, both ending in a submission the owner has to approve before it's
 *  live. */
export function AddPropertyFlow() {
  const [step, setStep] = useState<Step>("choose");
  const [extraction, setExtraction] = useState<ExtractionResponse | null>(null);
  const [formDefaults, setFormDefaults] = useState<PropertyFormValues | undefined>(undefined);
  const navigate = useNavigate();

  const submitMutation = useMutation({
    mutationFn: (values: PropertyFormValues) =>
      submitPropertyForReview({ data: { action: "create", values } }),
    onSuccess: () => {
      toast.success("Submitted — your admin will review it shortly.");
      navigate({ to: "/developer" });
    },
    onError: (e: Error) => toast.error(e.message || "Could not submit"),
  });

  if (step === "choose") {
    return (
      <div className="grid max-w-xl gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setStep("form")}
          className="hover-lift flex flex-col items-center gap-3 rounded-2xl border border-[var(--rule)] bg-card p-8 text-center shadow-[var(--shadow-lift)] transition-colors hover:border-champagne/40 focus-visible:ring-2 focus-visible:ring-champagne/50 focus-visible:outline-none"
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
          className="hover-lift flex flex-col items-center gap-3 rounded-2xl border border-[var(--rule)] bg-card p-8 text-center shadow-[var(--shadow-lift)] transition-colors hover:border-champagne/40 focus-visible:ring-2 focus-visible:ring-champagne/50 focus-visible:outline-none"
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
        fields={extractedFieldList(extraction)}
        onCancel={() => setStep("upload")}
        onContinue={(partial) => {
          setFormDefaults({
            ...emptyPropertyForm(),
            ...mapExtractedPayload(extraction.form_payload),
            ...partial,
          });
          setStep("form");
        }}
      />
    );
  }

  return (
    <PropertyForm
      defaultValues={formDefaults}
      submitLabel="Submit for review"
      hidePublishToggle
      submitting={submitMutation.isPending}
      onSubmit={(values) => submitMutation.mutate(values)}
    />
  );
}
