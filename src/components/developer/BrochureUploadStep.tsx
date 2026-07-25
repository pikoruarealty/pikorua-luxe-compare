import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { extractFromBrochures } from "@/lib/brochure-extract.functions";
import type { ExtractionResponse } from "@/lib/brochure-field-mapping";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Step 1 of the OCR path: pick brochure PDFs, send them to the extractor
 *  service, hand the result up once it comes back. */
export function BrochureUploadStep({
  onExtracted,
  onCancel,
}: {
  onExtracted: (result: ExtractionResponse) => void;
  onCancel: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const extractFn = useServerFn(extractFromBrochures);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const pdfs = Array.from(list).filter((f) => f.type === "application/pdf");
    setFiles((prev) => [...prev, ...pdfs]);
  };

  const extract = async () => {
    if (files.length === 0) return;
    setExtracting(true);
    setError("");
    try {
      const encoded = await Promise.all(
        files.map(async (f) => ({ fileName: f.name, fileBase64: await fileToBase64(f) })),
      );
      const result = await extractFn({ data: { files: encoded } });
      onExtracted(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed. Try again.");
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div className="max-w-xl">
      <p className="text-sm text-muted-foreground">
        Upload the brochure, RERA certificate, price list — whatever you have. We'll pull out
        whatever details are printed in them; you'll confirm each one and fill in the rest.
      </p>

      <label className="mt-6 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--rule-strong)] px-6 py-10 text-center transition-colors hover:border-champagne/50">
        <Upload className="h-6 w-6 text-muted-foreground" />
        <span className="text-sm text-foreground">Click to choose PDF files</span>
        <span className="text-xs text-muted-foreground">
          Brochure, RERA certificate, price list…
        </span>
        <input
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </label>

      {files.length > 0 && (
        <ul className="mt-4 space-y-2">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-[var(--rule)] bg-card px-3 py-2 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2 truncate text-foreground">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{f.name}</span>
              </span>
              <button
                type="button"
                onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                aria-label={`Remove ${f.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

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
          onClick={extract}
          disabled={files.length === 0 || extracting}
          className="foil inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[11px] font-semibold tracking-luxury uppercase disabled:opacity-60"
        >
          {extracting && <Loader2 className="h-4 w-4 animate-spin" />}
          {extracting ? "Extracting… this can take a minute" : "Extract details"}
        </button>
      </div>
    </div>
  );
}
