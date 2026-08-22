import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, ImageOff, Loader2, Upload, X, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import { importBrochureImage } from "@/api/functions/brochure-extract.functions";
import {
  DEFAULT_MAX_IMAGE_UPLOAD_BYTES,
  getPropertyImageUploadLimit,
  uploadPropertyImage,
} from "@/api/functions/property-images.functions";
import type { ExtractionResponse } from "@/lib/brochure-field-mapping";
import type { PropertyFormValues } from "@/lib/property-schema";

/** The five images a property shows on the site. `cover` is the card photo; the
 *  rest fill the gallery. */
const SLOTS = [
  { key: "cover", label: "Cover photo", hint: "The main image on listing cards" },
  { key: "livingRoom", label: "Living room", hint: "Gallery" },
  { key: "masterBedroom", label: "Master bedroom", hint: "Gallery" },
  { key: "pool", label: "Pool", hint: "Gallery" },
  { key: "clubhouse", label: "Clubhouse", hint: "Gallery" },
] as const;

type SlotKey = (typeof SLOTS)[number]["key"];

/** Step 3 of the OCR path: pick which of the images pulled out of the PDFs
 *  belong in which slot. Chosen images are copied into our own storage on
 *  Continue, so they survive the OCR service being redeployed or wiped. */
export function BrochureImagePicker({
  response,
  propertyName,
  onContinue,
  onCancel,
}: {
  response: ExtractionResponse;
  propertyName: string;
  onContinue: (images: Partial<PropertyFormValues>) => void;
  onCancel: () => void;
}) {
  // Biggest first — a hero shot is far more likely to be a large image than a
  // logo or an icon lifted off the same page.
  const candidates = useMemo(() => {
    const all = response.extraction.image_candidates ?? [];
    return [...all]
      .filter((c) => c.width >= 400 && c.height >= 300)
      .sort((a, b) => b.width * b.height - a.width * a.height)
      .slice(0, 60);
  }, [response]);

  const [picked, setPicked] = useState<Partial<Record<SlotKey, string>>>({});
  // Photos a reviewer uploaded directly for a slot rather than choosing one of
  // the candidates pulled out of the PDFs — already saved to permanent
  // storage on upload, so unlike `picked` these need no import step later.
  const [customUrls, setCustomUrls] = useState<Partial<Record<SlotKey, string>>>({});
  const [uploading, setUploading] = useState(false);
  const [maxUploadBytes, setMaxUploadBytes] = useState(DEFAULT_MAX_IMAGE_UPLOAD_BYTES);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const getUploadLimit = useServerFn(getPropertyImageUploadLimit);
  const uploadFn = useServerFn(uploadPropertyImage);
  const [activeSlot, setActiveSlot] = useState<SlotKey>("cover");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const importFn = useServerFn(importBrochureImage);

  useEffect(() => {
    getUploadLimit()
      .then(setMaxUploadBytes)
      .catch(() => {});
  }, [getUploadLimit]);

  const activeSlotIndex = SLOTS.findIndex((s) => s.key === activeSlot);
  const isLastSlot = activeSlotIndex === SLOTS.length - 1;

  const handleUpload = async (file: File) => {
    if (file.size > maxUploadBytes) {
      toast.error(`Image is too large (max ${(maxUploadBytes / 1_000_000).toFixed(1)}MB)`);
      return;
    }
    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
      });
      const res = await uploadFn({
        data: {
          folder: propertyName || "brochure",
          slot: activeSlot,
          fileName: file.name,
          contentType: file.type,
          fileBase64: base64,
        },
      });
      setCustomUrls((c) => ({ ...c, [activeSlot]: res.url }));
      setPicked((p) => ({ ...p, [activeSlot]: undefined }));
      toast.success("Photo uploaded");
    } catch (e) {
      toast.error((e as Error).message || "Upload failed");
    } finally {
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  };

  // Lets a reviewer check a candidate at full size before committing it to a
  // slot — thumbnails are cropped to 4:3 and can hide a bad crop or a logo.
  useEffect(() => {
    if (!previewUrl) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewUrl(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [previewUrl]);

  const chooseForActiveSlot = (url: string) => {
    setPicked((p) => ({ ...p, [activeSlot]: p[activeSlot] === url ? undefined : url }));
    setCustomUrls((c) => ({ ...c, [activeSlot]: undefined }));
  };

  const handleContinue = async () => {
    // Uploaded photos are already in permanent storage — only candidates
    // picked from the brochure still need the import/copy step.
    const toImport = Object.entries(picked).filter(
      ([slot, url]) => Boolean(url) && !customUrls[slot as SlotKey],
    ) as [SlotKey, string][];
    const alreadySaved = Object.entries(customUrls).filter(([, url]) => Boolean(url)) as [
      SlotKey,
      string,
    ][];

    if (toImport.length === 0 && alreadySaved.length === 0) {
      onContinue({});
      return;
    }
    setBusy(true);
    setError("");
    try {
      const folder = propertyName || "brochure";
      const imported = await Promise.all(
        toImport.map(async ([slot, url]) => {
          const { url: stored } = await importFn({ data: { imageUrl: url, slot, folder } });
          return [slot, stored] as const;
        }),
      );
      const bySlot = Object.fromEntries([...imported, ...alreadySaved]) as Partial<
        Record<SlotKey, string>
      >;
      onContinue({
        imageUrl: bySlot.cover ?? "",
        gallery: {
          livingRoom: bySlot.livingRoom ?? "",
          masterBedroom: bySlot.masterBedroom ?? "",
          pool: bySlot.pool ?? "",
          clubhouse: bySlot.clubhouse ?? "",
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save those images. Try again.");
    } finally {
      setBusy(false);
    }
  };

  // "Next" walks the reviewer through every slot one at a time; the primary
  // button only finishes the step once the last slot has been reached, so a
  // developer can't accidentally submit having only looked at the cover photo.
  const advance = () => {
    if (isLastSlot) {
      handleContinue();
      return;
    }
    setActiveSlot(SLOTS[activeSlotIndex + 1].key);
  };
  const retreat = () => {
    if (activeSlotIndex === 0) {
      onCancel();
      return;
    }
    setActiveSlot(SLOTS[activeSlotIndex - 1].key);
  };

  const activeCustomUrl = customUrls[activeSlot];

  return (
    <div className="max-w-3xl">
      <p className="text-sm text-muted-foreground">
        We pulled {candidates.length} usable photo{candidates.length > 1 ? "s" : ""} out of your
        files. Pick a slot, then click the photo that belongs there. Anything you skip you can add
        yourself later.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {SLOTS.map((slot) => {
          const isActive = activeSlot === slot.key;
          const isFilled = Boolean(picked[slot.key]) || Boolean(customUrls[slot.key]);
          return (
            <button
              key={slot.key}
              type="button"
              onClick={() => setActiveSlot(slot.key)}
              title={slot.hint}
              className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-medium transition-colors ${
                isActive
                  ? "border-champagne bg-champagne/10 text-foreground"
                  : "border-(--rule) text-muted-foreground hover:border-foreground/30"
              }`}
            >
              {isFilled && <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />}
              {slot.label}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Choosing for:{" "}
          <span className="text-foreground">{SLOTS.find((s) => s.key === activeSlot)?.label}</span>
        </p>
        <button
          type="button"
          onClick={() => uploadInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-full border border-(--rule-strong) px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-60"
        >
          <Upload className="h-3.5 w-3.5" />
          {uploading ? "Uploading…" : "Upload your own photo"}
        </button>
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
          }}
        />
      </div>

      {activeCustomUrl && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-champagne bg-champagne/5 px-3 py-2">
          <img
            src={activeCustomUrl}
            alt="Your upload"
            className="h-14 w-20 rounded-md object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground">Using your uploaded photo</p>
            <p className="text-[11px] text-muted-foreground">Replaces any brochure candidate.</p>
          </div>
          <button
            type="button"
            onClick={() => setCustomUrls((c) => ({ ...c, [activeSlot]: undefined }))}
            aria-label="Remove uploaded photo"
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {candidates.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-(--rule-strong) px-6 py-10 text-center">
          <ImageOff className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-foreground">No usable photos pulled from those files</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Layout and price-list PDFs usually have none — upload your own above, or skip and add
            photos later.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid max-h-[28rem] grid-cols-2 gap-3 overflow-y-auto rounded-xl border border-(--rule) p-3 sm:grid-cols-3 md:grid-cols-4">
          {candidates.map((img) => {
            const isChosen = picked[activeSlot] === img.image_path;
            const usedElsewhere = Object.entries(picked).find(
              ([slot, url]) => url === img.image_path && slot !== activeSlot,
            );
            return (
              <button
                key={img.image_path}
                type="button"
                onClick={() => chooseForActiveSlot(img.image_path)}
                className={`group relative aspect-[4/3] overflow-hidden rounded-lg border-2 transition-colors ${
                  isChosen ? "border-champagne" : "border-transparent hover:border-foreground/20"
                }`}
              >
                <img
                  src={img.image_path}
                  alt={`Page ${img.source_page}`}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewUrl(img.image_path);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.stopPropagation();
                    e.preventDefault();
                    setPreviewUrl(img.image_path);
                  }}
                  aria-label="View full size"
                  className="absolute top-1.5 left-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </span>
                {isChosen && (
                  <span className="absolute top-1.5 right-1.5 grid h-6 w-6 place-items-center rounded-full bg-champagne text-lux-black">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                )}
                {usedElsewhere && !isChosen && (
                  <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-medium text-white">
                    {SLOTS.find((s) => s.key === usedElsewhere[0])?.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <BackBtn onClick={retreat} label={activeSlotIndex === 0 ? "Back" : "Previous"} />
        <ContinueBtn
          onClick={advance}
          busy={busy}
          label={busy ? "Saving photos…" : isLastSlot ? "Continue to form" : "Next"}
        />
        <span className="text-xs text-muted-foreground">
          {SLOTS.filter((s) => Boolean(picked[s.key]) || Boolean(customUrls[s.key])).length} of{" "}
          {SLOTS.length} slots filled
        </span>
      </div>

      {previewUrl && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setPreviewUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
        >
          <button
            type="button"
            onClick={() => setPreviewUrl(null)}
            aria-label="Close preview"
            className="absolute top-4 right-4 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={previewUrl}
            alt="Full size preview"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}

function BackBtn({ onClick, label = "Back" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-(--rule-strong) px-5 py-2.5 text-[11px] font-semibold tracking-luxury text-foreground uppercase transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-champagne/40 focus-visible:outline-none"
    >
      {label}
    </button>
  );
}

function ContinueBtn({
  onClick,
  label,
  busy,
}: {
  onClick: () => void;
  label: string;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="foil inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[11px] font-semibold tracking-luxury uppercase disabled:opacity-60"
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {label}
    </button>
  );
}
