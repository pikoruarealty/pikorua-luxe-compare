import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, ImageOff, Loader2 } from "lucide-react";
import { importBrochureImage } from "@/api/functions/brochure-extract.functions";
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
  const [activeSlot, setActiveSlot] = useState<SlotKey>("cover");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const importFn = useServerFn(importBrochureImage);

  const chooseForActiveSlot = (url: string) =>
    setPicked((p) => ({ ...p, [activeSlot]: p[activeSlot] === url ? undefined : url }));

  const handleContinue = async () => {
    const entries = Object.entries(picked).filter(([, url]) => Boolean(url)) as [SlotKey, string][];
    if (entries.length === 0) {
      onContinue({});
      return;
    }
    setBusy(true);
    setError("");
    try {
      const folder = propertyName || "brochure";
      const saved = await Promise.all(
        entries.map(async ([slot, url]) => {
          const { url: stored } = await importFn({ data: { imageUrl: url, slot, folder } });
          return [slot, stored] as const;
        }),
      );
      const bySlot = Object.fromEntries(saved) as Partial<Record<SlotKey, string>>;
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

  if (candidates.length === 0) {
    return (
      <div className="max-w-2xl">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-(--rule-strong) px-6 py-12 text-center">
          <ImageOff className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-foreground">No usable photos in those files</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Layout and price-list PDFs usually have none. You can add photos yourself on the next
            screen.
          </p>
        </div>
        <div className="mt-6 flex gap-3">
          <BackBtn onClick={onCancel} />
          <ContinueBtn onClick={() => onContinue({})} label="Skip — add photos later" />
        </div>
      </div>
    );
  }

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
          const isFilled = Boolean(picked[slot.key]);
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

      <p className="mt-3 text-xs text-muted-foreground">
        Choosing for: <span className="text-foreground">{SLOTS.find((s) => s.key === activeSlot)?.label}</span>
      </p>

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

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <BackBtn onClick={onCancel} />
        <ContinueBtn
          onClick={handleContinue}
          busy={busy}
          label={busy ? "Saving photos…" : "Continue to form"}
        />
        <span className="text-xs text-muted-foreground">
          {Object.values(picked).filter(Boolean).length} of {SLOTS.length} slots filled
        </span>
      </div>
    </div>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-(--rule-strong) px-5 py-2.5 text-[11px] font-semibold tracking-luxury text-foreground uppercase transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-champagne/40 focus-visible:outline-none"
    >
      Back
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
