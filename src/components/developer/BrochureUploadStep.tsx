import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Loader2, Upload, X } from "lucide-react";
import {
  createBrochureUploadTicket,
  getBrochureExtractionProgress,
  getBrochureExtraction,
} from "@/api/functions/brochure-extract.functions";
import type { ExtractionResponse } from "@/lib/brochure-field-mapping";
import { pollUntilExtracted } from "@/lib/poll-extraction";

const MAX_FILES = 6;

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
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const ticketFn = useServerFn(createBrochureUploadTicket);
  const progressFn = useServerFn(getBrochureExtractionProgress);
  const resultFn = useServerFn(getBrochureExtraction);

  // Guards against a poll landing after the step unmounts (developer hit Back
  // mid-extraction), which would otherwise setState on a dead component.
  const cancelledRef = useRef(false);
  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const pdfs = Array.from(list).filter((f) => f.type === "application/pdf");
    setError("");
    setFiles((prev) => [...prev, ...pdfs].slice(0, MAX_FILES));
  };

  /** Posts the PDFs to the extractor itself rather than through our own server,
   *  which could not carry them: brochures run to tens of megabytes and a
   *  serverless request body is capped in single digits. The ticket is what
   *  makes that safe — the browser never sees the service key. */
  const upload = async (): Promise<string> => {
    const { uploadUrl, token } = await ticketFn();

    const form = new FormData();
    for (const file of files) {
      const name = file.name.toLowerCase().endsWith(".pdf") ? file.name : `${file.name}.pdf`;
      form.append("files", file, name);
    }

    let res: Response;
    try {
      res = await fetch(uploadUrl, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
    } catch {
      throw new Error("Couldn't reach the OCR service. It may be offline — try again shortly.");
    }

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.detail ?? body?.error ?? `OCR service error (${res.status})`);
    }
    const body = (await res.json()) as { job_id?: string };
    if (!body?.job_id) throw new Error("OCR service didn't return a job id");
    return body.job_id;
  };

  const extract = async () => {
    if (files.length === 0) return;
    setExtracting(true);
    setProgress(null);
    setError("");
    try {
      const jobId = await upload();

      // Extraction is a background job on the service — one LLM call per batch
      // of pages, so a full brochure runs for minutes. Poll rather than hold a
      // request open, which no serverless platform would allow anyway.
      await pollUntilExtracted({
        fetchProgress: () => progressFn({ data: { jobId } }),
        onProgress: (done, total) => setProgress({ done, total }),
        isCancelled: () => cancelledRef.current,
        wait: (ms) => new Promise((r) => setTimeout(r, ms)),
      });
      if (cancelledRef.current) return;

      const result = await resultFn({ data: { jobId } });
      if (!cancelledRef.current) onExtracted(result);
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : "Extraction failed. Try again.");
      }
    } finally {
      if (!cancelledRef.current) {
        setExtracting(false);
        setProgress(null);
      }
    }
  };

  const progressLabel = () => {
    if (!progress || progress.total === 0) return "Uploading your files…";
    return `Extracting… page batch ${Math.min(progress.done + 1, progress.total)} of ${progress.total}`;
  };

  return (
    <div className="max-w-xl">
      <p className="text-sm text-muted-foreground">
        Upload the brochure, RERA certificate, price list — whatever you have. We'll pull out
        whatever details are printed in them; you'll confirm each one and fill in the rest.
      </p>

      <label className="mt-6 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-(--rule-strong) px-6 py-10 text-center transition-colors hover:border-champagne/50">
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
              className="flex items-center justify-between gap-2 rounded-lg border border-(--rule) bg-card px-3 py-2 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2 truncate text-foreground">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{f.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {(f.size / 1024 / 1024).toFixed(1)} MB
                </span>
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
          className="rounded-full border border-(--rule-strong) px-5 py-2.5 text-[11px] font-semibold tracking-luxury text-foreground uppercase transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-champagne/40 focus-visible:outline-none"
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
          {extracting ? progressLabel() : "Extract details"}
        </button>
      </div>
    </div>
  );
}
