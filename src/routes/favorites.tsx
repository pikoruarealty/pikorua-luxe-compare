import { createFileRoute, Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { PropertyListRow } from "@/components/property/PropertyListRow";
import { useProperties } from "@/context/PropertiesContext";
import { useFavoritesStore } from "@/stores/favorites-store";
import { useSavedComparesStore } from "@/stores/saved-compares-store";
import { SavedComparesList } from "@/components/compare/SavedComparesList";
import { useHydrated } from "@/hooks/use-hydrated";
import { useState } from "react";

export const Route = createFileRoute("/favorites")({
  head: () => ({
    meta: [
      { title: "Saved Residences — Pikorua" },
      {
        name: "description",
        content: "Your curated collection of saved luxury residences on Pikorua.",
      },
    ],
  }),
  component: FavoritesPage,
});

function FavoritesPage() {
  const hydrated = useHydrated();
  const properties = useProperties();
  const { favorites, clear } = useFavoritesStore();
  const savedCompares = useSavedComparesStore((s) => s.saved);
  const saved = hydrated ? properties.filter((p) => favorites.includes(p.id)) : [];
  const [tab, setTab] = useState<"residences" | "comparisons">("residences");

  return (
    <div className="min-h-screen pb-32">
      <SiteHeader />

      <section className="relative overflow-hidden pt-36 pb-10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "var(--gradient-radial-gold)" }}
        />
        <div className="mx-auto max-w-7xl px-6">
          <p className="text-[11px] tracking-luxury text-champagne">Your Private Collection</p>
          <h1 className="mt-5 font-display text-5xl text-ivory sm:text-6xl">
            Saved <span className="gold-text">Residences</span>
          </h1>
          <p className="mt-4 max-w-xl text-sm text-muted-foreground">
            Curated favourites you've earmarked for closer consideration. Tap the heart on any
            residence to add it here, or save a whole comparison from the suite.
          </p>

          <div className="mt-8 inline-flex rounded-full border border-border p-1">
            {(
              [
                ["residences", `Residences${hydrated && saved.length ? ` (${saved.length})` : ""}`],
                [
                  "comparisons",
                  `Comparisons${hydrated && savedCompares.length ? ` (${savedCompares.length})` : ""}`,
                ],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`rounded-full px-5 py-2 text-[11px] tracking-luxury transition-colors ${
                  tab === key
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6">
        {tab === "comparisons" ? (
          !hydrated ? (
            <div className="rounded-4xl border border-champagne/15 bg-card p-16" aria-hidden>
              <div className="mx-auto h-4 w-40 animate-pulse rounded-full bg-muted" />
            </div>
          ) : (
            <SavedComparesList />
          )
        ) : !hydrated ? (
          <div className="rounded-4xl border border-champagne/15 bg-card p-16" aria-hidden>
            <div className="mx-auto h-4 w-40 animate-pulse rounded-full bg-muted" />
          </div>
        ) : saved.length === 0 ? (
          <div className="rounded-4xl border border-champagne/15 bg-card p-16 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full gold-border text-champagne">
              <Heart className="h-5 w-5" />
            </div>
            <h2 className="mt-6 font-display text-2xl text-ivory">No saved residences yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Browse the collection and tap the heart on any residence to add it to your favorites.
            </p>
            <Link
              to="/"
              className="mt-7 inline-flex items-center justify-center rounded-full bg-champagne px-7 py-3 text-xs tracking-luxury text-lux-black transition hover:opacity-90"
            >
              Explore Residences
            </Link>
          </div>
        ) : (
          <>
            <div className="flex items-end justify-between border-b border-champagne/15 pb-5">
              <p className="text-xs tracking-luxury text-muted-foreground">
                {saved.length} saved {saved.length === 1 ? "residence" : "residences"}
              </p>
              {saved.length > 0 && (
                <button
                  onClick={clear}
                  className="text-[11px] tracking-luxury text-muted-foreground transition hover:text-champagne"
                >
                  Clear All
                </button>
              )}
            </div>
            <div className="mt-7 flex flex-col gap-5">
              {saved.map((p, i) => (
                <PropertyListRow key={p.id} property={p} index={i} />
              ))}
            </div>
          </>
        )}
      </section>

      <SiteFooter />
    </div>
  );
}
