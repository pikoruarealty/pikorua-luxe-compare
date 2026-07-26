import { useMemo, useRef, useState } from "react";
import { Ruler, Search, SearchX, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Property } from "@/types/property";

export function PropertyPickerModal({
  open,
  onOpenChange,
  index,
  onPick,
  currentSelected,
  pickable,
  noMatches,
  onClearFilters,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  index: number;
  onPick: (id: string) => void;
  currentSelected: string[];
  pickable: Property[];
  noMatches: boolean;
  onClearFilters: () => void;
}) {
  const indexLabel = String.fromCharCode(65 + index);
  const available = useMemo(
    () => pickable.filter((p) => !currentSelected.includes(p.id)),
    [pickable, currentSelected],
  );

  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState(1);
  const [progress, setProgress] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return available;
    return available.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.developer.toLowerCase().includes(q) ||
        p.location.toLowerCase().includes(q) ||
        p.configuration.toLowerCase().includes(q),
    );
  }, [available, query]);

  const total = filtered.length;

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el || total <= 1) return;
    const max = el.scrollHeight - el.clientHeight;
    const p = max > 0 ? el.scrollTop / max : 0;
    setProgress(p);
    setPosition(Math.min(total, Math.max(1, Math.round(p * (total - 1)) + 1)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Mobile: bottom sheet. sm+: centred modal up to 3xl wide.
          The base DialogContent already handles the slide-up animation,
          border-radius, and max-height — we only override width and padding. */}
      <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-[var(--rule)] bg-popover p-0 sm:max-w-3xl sm:max-h-[85vh] sm:rounded-card">
        {noMatches ? (
          <>
            <DialogHeader className="border-b border-[var(--rule)] px-6 pb-4 pt-6">
              <DialogTitle
                className="font-display text-foreground"
                style={{ fontSize: "var(--step-1)" }}
              >
                Select property {indexLabel}
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-full border border-[var(--rule)] text-muted-foreground">
                <SearchX className="h-6 w-6" />
              </div>
              <div>
                <p className="font-display text-foreground" style={{ fontSize: "var(--step-1)" }}>
                  No residences found
                </p>
                <p
                  className="mt-2 max-w-sm text-muted-foreground"
                  style={{ fontSize: "var(--step--1)" }}
                >
                  Nothing matches your current preferences. Loosen a filter or clear them to see the
                  full collection.
                </p>
              </div>
              <button
                type="button"
                onClick={onClearFilters}
                className="tracking-luxury mt-2 inline-flex items-center gap-2 rounded-full bg-champagne px-6 py-2.5 font-medium text-lux-black transition-opacity hover:opacity-90"
                style={{ fontSize: "var(--step--2)" }}
              >
                <X className="h-3.5 w-3.5" /> Clear filters
              </button>
            </div>
          </>
        ) : available.length === 0 ? (
          <>
            <DialogHeader className="border-b border-[var(--rule)] px-6 pb-4 pt-6">
              <DialogTitle
                className="font-display text-foreground"
                style={{ fontSize: "var(--step-1)" }}
              >
                All properties added
              </DialogTitle>
              <DialogDescription
                className="text-muted-foreground"
                style={{ fontSize: "var(--step--2)" }}
              >
                Remove one from your comparison to swap it out.
              </DialogDescription>
            </DialogHeader>
            <p
              className="px-6 py-12 text-center text-muted-foreground"
              style={{ fontSize: "var(--step--1)" }}
            >
              Nothing left to add.
            </p>
          </>
        ) : (
          <>
            <DialogHeader className="shrink-0 border-b border-[var(--rule)] px-4 pb-2 pt-3 sm:px-6 sm:pb-3 sm:pt-5">
              <div className="flex items-center justify-between gap-3 pr-8 sm:items-end sm:gap-4 sm:pr-10">
                <div className="min-w-0">
                  <p
                    className="tracking-luxury font-semibold text-muted-foreground"
                    style={{ fontSize: "var(--step--2)" }}
                  >
                    Select property {indexLabel}
                  </p>
                  <DialogTitle
                    className="mt-0.5 font-display leading-tight text-foreground sm:mt-1"
                    style={{ fontSize: "var(--step-0)" }}
                  >
                    Choose from your matched residences
                  </DialogTitle>
                </div>
                <ScrollCounter position={position} total={total} progress={progress} />
              </div>

              <div className="relative mt-2 sm:mt-3">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, developer or location…"
                  className="w-full rounded-full border border-[var(--rule)] bg-background py-2 pr-3 pl-9 text-[16px] text-foreground outline-none focus:border-champagne sm:py-2.5 md:text-sm"
                />
              </div>

              <DialogDescription className="sr-only">
                Search or scroll to browse residences and add one to your comparison.
              </DialogDescription>
            </DialogHeader>

            {filtered.length === 0 ? (
              <p
                className="flex-1 px-6 py-16 text-center text-muted-foreground"
                style={{ fontSize: "var(--step--1)" }}
              >
                No residences match “{query}”.
              </p>
            ) : (
              <div
                ref={scrollRef}
                onScroll={onScroll}
                className="min-h-0 flex-1 snap-y snap-mandatory scroll-smooth overflow-y-auto px-4 py-4 [scrollbar-width:none] sm:px-5 sm:py-5 [&::-webkit-scrollbar]:hidden"
              >
                <div className="flex flex-col gap-4 sm:gap-5">
                  {filtered.map((p) => (
                    <div key={p.id} className="snap-start">
                      <PickerCard key={p.id} property={p} onPick={onPick} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ScrollCounter({
  position,
  total,
  progress,
}: {
  position: number;
  total: number;
  progress: number;
}) {
  return (
    <div
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--rule-strong)] bg-card/90 px-3.5 py-1.5 shadow-2xs"
      aria-label={`Residences list position ${position} of ${total}`}
    >
      <span className="font-display text-sm font-bold text-champagne tabular-nums leading-none">
        {position}
      </span>
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground leading-none">
        of
      </span>
      <span className="font-display text-sm font-bold text-foreground tabular-nums leading-none">
        {total}
      </span>
    </div>
  );
}

function PickerCard({ property, onPick }: { property: Property; onPick: (id: string) => void }) {
  return (
    <div className="group relative flex flex-col gap-3 overflow-hidden rounded-card border border-[var(--rule)] bg-card p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-card sm:aspect-[4/3] sm:w-40 sm:shrink-0">
        <img
          src={property.image}
          alt={property.name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="tracking-luxury font-medium text-champagne"
            style={{ fontSize: "var(--step--2)" }}
          >
            {property.developer}
          </span>
          <span className="text-muted-foreground">•</span>
          <span className="text-muted-foreground" style={{ fontSize: "var(--step--2)" }}>
            {property.location}
          </span>
        </div>
        <h3
          className="mt-0.5 font-display font-semibold text-foreground line-clamp-1"
          style={{ fontSize: "var(--step-0)" }}
        >
          {property.name}
        </h3>
        <p
          className="mt-1 text-muted-foreground line-clamp-1"
          style={{ fontSize: "var(--step--1)" }}
        >
          {property.configuration} · {property.category}
        </p>
        {property.size && property.size !== "-" && (
          <span
            className="mt-1.5 inline-flex items-center gap-1.5 text-foreground/85"
            style={{ fontSize: "var(--step--1)" }}
          >
            <Ruler className="h-3.5 w-3.5 text-foreground" /> {property.size}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => onPick(property.id)}
        className="tracking-luxury rounded-full border border-foreground/30 bg-foreground/5 px-4 py-2 text-foreground transition-colors hover:border-foreground hover:bg-foreground hover:text-background sm:shrink-0"
        style={{ fontSize: "var(--step--2)" }}
      >
        Select
      </button>
    </div>
  );
}
