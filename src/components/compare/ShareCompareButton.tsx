import { useState } from "react";
import { Check, Copy, Mail, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Property } from "@/types/property";

interface Props {
  properties: Property[];
  className?: string;
}

/**
 * Builds the shareable link for a comparison. The /compare route already reads
 * its members from `?ids=`, so the URL alone carries the whole comparison —
 * no server-side share record is needed.
 */
export function buildShareUrl(properties: Property[]): string {
  const ids = properties.map((p) => p.id).join(",");
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  // `shared=true` is the value the route's schema normalises to — emitting it
  // directly saves every shared link a redirect hop.
  return `${origin}/compare?ids=${encodeURIComponent(ids)}&shared=true`;
}

export function ShareCompareButton({ properties, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const names = properties.map((p) => p.name);
  const label = names.join(" vs ");
  const url = buildShareUrl(properties);
  const message = `Take a look at this comparison on Pikorua — ${label}:\n${url}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the link. Select and copy it manually.");
    }
  };

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
  const mailUrl = `mailto:?subject=${encodeURIComponent(
    `Pikorua comparison — ${label}`,
  )}&body=${encodeURIComponent(message)}`;

  // The OS share sheet is the best option where it exists (mobile), so offer
  // it first rather than duplicating what the platform already does well.
  const nativeShare = async () => {
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
    try {
      await navigator.share({ title: `Pikorua comparison — ${label}`, text: label, url });
      return true;
    } catch {
      // User dismissed the sheet — fall through to the popover options.
      return true;
    }
  };

  const onTriggerClick = async (e: React.MouseEvent) => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      e.preventDefault();
      await nativeShare();
      return;
    }
    setOpen((v) => !v);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={onTriggerClick}
          aria-label="Share this comparison"
          className={`inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-[11px] tracking-wide text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground ${className}`}
        >
          <Share2 className="h-3 w-3" /> Share
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-70 p-3">
        <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
          Share this comparison
        </p>
        <p className="mt-1.5 text-[12px] leading-snug text-foreground">{label}</p>

        <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2">
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{url}</span>
          <button
            type="button"
            onClick={copy}
            aria-label="Copy link"
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[11px] text-foreground transition-colors hover:border-foreground/40"
          >
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </a>
          <a
            href={mailUrl}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[11px] text-foreground transition-colors hover:border-foreground/40"
          >
            <Mail className="h-3.5 w-3.5" /> Email
          </a>
        </div>
      </PopoverContent>
    </Popover>
  );
}
