import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo } from "react";
import { usePropertyLookup } from "@/context/PropertiesContext";
import { useOnboarding } from "@/context/OnboardingContext";
import type { Property } from "@/types/property";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { ComparisonHero } from "@/components/compare/ComparisonHero";
import { PropertyHeaderCards } from "@/components/compare/PropertyHeaderCards";
import { SectionNav } from "@/components/compare/SectionNav";
import { OverviewSection } from "@/components/compare/OverviewSection";
import { RoomDimensionsSection } from "@/components/compare/RoomDimensionsSection";
import { AmenitiesSection } from "@/components/compare/AmenitiesSection";
import { AdvantagesSection } from "@/components/compare/AdvantagesSection";
import { DifferenceHighlights } from "@/components/compare/DifferenceHighlights";
import { GalleryComparison } from "@/components/compare/GalleryComparison";
import { ExpertVerdict } from "@/components/compare/ExpertVerdict";
import { PreferenceBanner } from "@/components/marketing/PreferenceBanner";

const searchSchema = z.object({
  ids: z.string().optional().default(""),
  /** Set by ShareCompareButton — marks an inbound link from someone else. */
  shared: z.coerce.boolean().optional().default(false),
});

export const Route = createFileRoute("/compare")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Comparison Suite — PropCompare" },
      {
        name: "description",
        content: "Side-by-side comparison of luxury residences from the PropCompare collection.",
      },
      { property: "og:title", content: "Comparison Suite — PropCompare" },
      {
        property: "og:description",
        content: "Side-by-side comparison of luxury residences.",
      },
    ],
  }),
  component: ComparePage,
});

function ComparePage() {
  const { ids, shared } = Route.useSearch();
  const getPropertyById = usePropertyLookup();
  const { userProfile, hydrated, requestGatedAuth } = useOnboarding();

  // A shared link is gated: the recipient identifies themselves before the
  // comparison renders. Wait for `hydrated` so a returning signed-in visitor
  // never sees the gate flash while the session check resolves.
  const gated = shared && hydrated && !userProfile;
  useEffect(() => {
    if (gated) requestGatedAuth();
  }, [gated, requestGatedAuth]);
  const properties = useMemo(() => {
    const idList: string[] = (ids ?? "")
      .split(",")
      .map((id: string) => id.trim())
      .filter((id: string) => id.length > 0);
    return idList
      .map((id) => getPropertyById(id))
      .filter((p): p is Property => Boolean(p))
      .slice(0, 3);
  }, [ids, getPropertyById]);

  // Hold the comparison back entirely rather than rendering it behind the
  // overlay — the content must not be readable before the visitor signs in.
  if (shared && (!hydrated || !userProfile)) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 text-center">
          <p className="text-[11px] tracking-luxury text-champagne">Shared comparison</p>
          <h1 className="mt-4 font-display text-4xl text-ivory sm:text-5xl">
            A comparison was <span className="gold-text">shared with you</span>
          </h1>
          <p className="mt-4 max-w-md text-muted-foreground">
            {properties.length >= 2
              ? `${properties.map((p) => p.name).join(" vs ")}. Sign in with your details to view the full comparison.`
              : "Sign in with your details to view the full comparison."}
          </p>
          {hydrated && (
            <button
              onClick={requestGatedAuth}
              className="mt-8 inline-flex items-center justify-center rounded-full bg-champagne px-7 py-3 text-xs tracking-luxury text-lux-black transition hover:opacity-90"
            >
              Continue to view
            </button>
          )}
        </div>
      </div>
    );
  }

  if (properties.length < 2) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 text-center">
          <p className="text-[11px] tracking-luxury text-champagne">Comparison unavailable</p>
          <h1 className="mt-4 font-display text-4xl text-ivory sm:text-5xl">
            Select at least <span className="gold-text">two residences</span>
          </h1>
          <p className="mt-4 text-muted-foreground">
            Return to the collection and add 2–3 properties to begin comparison.
          </p>
          <Link
            to="/"
            className="mt-8 inline-flex items-center gap-2 rounded-full gold-border px-6 py-3 text-xs tracking-luxury text-champagne hover:bg-champagne hover:text-lux-black"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Residences
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32">
      <SiteHeader />

      <div className="mx-auto max-w-7xl px-6">
        <ComparisonHero properties={properties} />
        <div className="mb-6">
          <PreferenceBanner />
        </div>
        <PropertyHeaderCards properties={properties} />
        <div className="mt-6">
          <SectionNav />
        </div>
        <OverviewSection properties={properties} />
        <RoomDimensionsSection properties={properties} />
        <AmenitiesSection properties={properties} />
        <AdvantagesSection properties={properties} />
        <DifferenceHighlights properties={properties} />
        <GalleryComparison properties={properties} />
        <ExpertVerdict properties={properties} />

        <div className="mt-20 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full gold-border px-6 py-3 text-xs tracking-luxury text-champagne hover:bg-champagne hover:text-lux-black"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Residences
          </Link>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
