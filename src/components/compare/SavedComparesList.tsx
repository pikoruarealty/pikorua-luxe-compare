import { Link } from "@tanstack/react-router";
import { GitCompareArrows, Trash2 } from "lucide-react";
import { useProperties } from "@/context/PropertiesContext";
import { useSavedComparesStore } from "@/stores/saved-compares-store";
import { useCompareStore } from "@/stores/compare-store";
import { ShareCompareButton } from "@/components/compare/ShareCompareButton";
import type { Property } from "@/types/property";

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function SavedComparesList() {
  const properties = useProperties();
  const { saved, remove, clear } = useSavedComparesStore();
  const { clear: clearCompare, toggle: toggleCompare } = useCompareStore();

  // Reopens a saved set on the on-page comparison board (the quick suite),
  // not the full report — the full report is one more click away from there,
  // same as any other comparison the visitor builds fresh.
  const openOnBoard = (ids: string[]) => {
    clearCompare();
    ids.forEach((id) => toggleCompare(id));
  };

  // A saved set can outlive one of its residences (unpublished, renamed id).
  // Resolve what still exists and drop entries that no longer compare.
  const rows = saved
    .map((entry) => ({
      entry,
      members: entry.propertyIds
        .map((id) => properties.find((p) => p.id === id))
        .filter((p): p is Property => Boolean(p)),
    }))
    .filter((r) => r.members.length >= 2);

  if (rows.length === 0) {
    return (
      <div className="rounded-[28px] border border-champagne/15 bg-card p-16 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full gold-border text-champagne">
          <GitCompareArrows className="h-5 w-5" />
        </div>
        <h2 className="mt-6 font-display text-2xl text-ivory">No saved comparisons yet</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Build a comparison, then use “Save comparison” to keep the whole set here.
        </p>
        <Link
          to="/"
          className="mt-7 inline-flex items-center justify-center rounded-full bg-champagne px-7 py-3 text-xs tracking-luxury text-lux-black transition hover:opacity-90"
        >
          Build a Comparison
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-end justify-between border-b border-champagne/15 pb-5">
        <p className="text-xs tracking-luxury text-muted-foreground">
          {rows.length} saved {rows.length === 1 ? "comparison" : "comparisons"}
        </p>
        <button
          onClick={clear}
          className="text-[11px] tracking-luxury text-muted-foreground transition hover:text-champagne"
        >
          Clear All
        </button>
      </div>

      <div className="mt-7 flex flex-col gap-4">
        {rows.map(({ entry, members }) => (
          <article
            key={entry.id}
            className="rounded-2xl border border-border bg-card/40 p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
                  {members.length} residences · saved {dateFmt.format(entry.savedAt)}
                </p>
                <h3 className="descender-safe mt-1.5 font-display text-[18px] leading-tight text-foreground sm:text-[20px]">
                  {members.map((p) => p.name).join(" vs ")}
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to="/"
                  hash="suite"
                  onClick={() => openOnBoard(members.map((p) => p.id))}
                  className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-1.5 text-[11px] tracking-wide text-background transition hover:opacity-85"
                >
                  <GitCompareArrows className="h-3 w-3" /> Open
                </Link>
                <ShareCompareButton properties={members} />
                <button
                  onClick={() => remove(entry.id)}
                  aria-label="Remove saved comparison"
                  className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {members.map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <img
                    src={p.image}
                    alt=""
                    loading="lazy"
                    className="h-12 w-16 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0">
                    <p className="descender-safe truncate font-display text-[13px] leading-tight text-foreground">
                      {p.name}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">{p.location}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
