import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  BellRing,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Crown,
  Dumbbell,
  Expand,
  GitCompareArrows,
  MapPin,
  MessageCircle,
  Phone,
  Quote,
  Ruler,
  ShieldCheck,
  Sparkles,
  Trophy,
  Utensils,
  Waves,
  Wine,
  Zap,
} from "lucide-react";

function getAmenityMeta(name: string): { Icon: typeof Sparkles; subtitle: string } {
  const n = name.toLowerCase();
  if (n.includes("pool") || n.includes("water") || n.includes("swim")) {
    return { Icon: Waves, subtitle: "Temperature-Controlled Sky Pool" };
  }
  if (n.includes("spa") || n.includes("sauna") || n.includes("wellness") || n.includes("jacuzzi")) {
    return { Icon: Sparkles, subtitle: "Thermal & Hydrotherapy Suites" };
  }
  if (
    n.includes("concierge") ||
    n.includes("butler") ||
    n.includes("24/7") ||
    n.includes("reception")
  ) {
    return { Icon: BellRing, subtitle: "White-Glove Hospitality Services" };
  }
  if (n.includes("lounge") || n.includes("sky") || n.includes("deck") || n.includes("terrace")) {
    return { Icon: Wine, subtitle: "Private Members Panorama Bar" };
  }
  if (
    n.includes("banquet") ||
    n.includes("hall") ||
    n.includes("dining") ||
    n.includes("ballroom")
  ) {
    return { Icon: Utensils, subtitle: "Exclusive Event & Gala Suite" };
  }
  if (
    n.includes("cinema") ||
    n.includes("theater") ||
    n.includes("theatre") ||
    n.includes("movie")
  ) {
    return { Icon: Clapperboard, subtitle: "4K Dolby Atmos Private Screening" };
  }
  if (
    n.includes("fitness") ||
    n.includes("gym") ||
    n.includes("workout") ||
    n.includes("training")
  ) {
    return { Icon: Dumbbell, subtitle: "State-of-the-Art Wellness Center" };
  }
  if (
    n.includes("ev") ||
    n.includes("charge") ||
    n.includes("electric") ||
    n.includes("charging")
  ) {
    return { Icon: Zap, subtitle: "Ultra-Fast Green Energy Station" };
  }
  if (n.includes("security") || n.includes("cctv") || n.includes("guard") || n.includes("gate")) {
    return { Icon: ShieldCheck, subtitle: "Multi-Tier Biometric Protection" };
  }
  if (
    n.includes("tennis") ||
    n.includes("squash") ||
    n.includes("badminton") ||
    n.includes("sports")
  ) {
    return { Icon: Trophy, subtitle: "Championship Athletic Courts" };
  }
  if (n.includes("club") || n.includes("house")) {
    return { Icon: Crown, subtitle: "5-Star Lifestyle Clubhouse" };
  }
  return { Icon: Sparkles, subtitle: "Premium Residence Amenity" };
}
import { toast } from "sonner";
import { useProperties } from "@/context/PropertiesContext";
import { getPropertyBySlug } from "@/api/functions/properties.functions";
import type { Property } from "@/types/property";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Lightbox } from "@/components/common/Lightbox";
import { FavoriteButton } from "@/components/property/FavoriteButton";
import { MAX_COMPARE, useCompareStore } from "@/stores/compare-store";
import { ResidenceLayouts } from "@/components/residence/ResidenceLayouts";
import { useHydrated } from "@/hooks/use-hydrated";
import { useActivityLog } from "@/hooks/use-activity-log";
import { recordView } from "@/lib/recently-viewed";
import { hasPrice, priceLabel } from "@/lib/price-format";
import { getCatalogueBootstrap } from "@/api/functions/catalogue-bootstrap.functions";
import { getV2PublicPropertyDetail } from "@/api/functions/public-detail.functions";
import { V2ResidenceDetail } from "@/components/residence/V2ResidenceDetail";

const WHATSAPP_NUMBER = "916354359222";
const PHONE_NUMBER = "+916354359222";

export const Route = createFileRoute("/residence/$id")({
  loader: async ({ params }) => {
    const v2 = await getCatalogueBootstrap();
    return v2.enabled
      ? {
          mode: "v2" as const,
          detail: await getV2PublicPropertyDetail({ data: { slug: params.id } }),
        }
      : { mode: "legacy" as const, detail: await getPropertyBySlug({ data: { slug: params.id } }) };
  },
  head: () => ({
    meta: [
      { title: "Residence — PropCompare" },
      {
        name: "description",
        content:
          "Explore this luxury residence in detail — gallery, floor plans, amenities and private advisory perspective.",
      },
    ],
  }),
  component: ResidencePage,
});

function residenceImages(p: Property): string[] {
  const g = (p.gallery ?? {}) as unknown as Record<string, string>;
  const list = [p.image, g.livingRoom, g.masterBedroom, g.pool, g.clubhouse].filter(
    (s): s is string => Boolean(s),
  );
  return Array.from(new Set(list));
}

function ResidencePage() {
  const loaderData = Route.useLoaderData();
  if (loaderData.mode === "v2" && loaderData.detail) {
    return <V2ResidenceDetail detail={loaderData.detail} />;
  }
  const property = loaderData.mode === "legacy" ? loaderData.detail : null;

  if (!property) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-6 text-center">
          <p className="tracking-luxury text-champagne text-xs font-semibold uppercase">
            Not found
          </p>
          <h1
            className="mt-4 font-display text-2xl sm:text-3xl font-bold text-foreground"
            style={{ letterSpacing: "var(--tracking-display)" }}
          >
            This residence isn't in our portfolio
          </h1>
          <Link
            to="/"
            className="tracking-luxury mt-8 inline-flex items-center gap-2 rounded-full gold-border px-6 py-3 text-champagne hover:bg-champagne hover:text-lux-black text-xs font-semibold uppercase transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to the collection
          </Link>
        </div>
      </div>
    );
  }

  return <ResidenceContent property={property} />;
}

function ResidenceContent({ property }: { property: Property }) {
  const hydrated = useHydrated();
  const properties = useProperties();
  const images = useMemo(() => residenceImages(property), [property]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState(0);
  const [mobileSlideIdx, setMobileSlideIdx] = useState(0);
  const { isSelected, toggle, selected } = useCompareStore();
  const selectedFlag = hydrated && isSelected(property.id);
  const atMax = hydrated && selected.length >= MAX_COMPARE && !selectedFlag;
  const logActivity = useActivityLog();

  useEffect(() => {
    recordView(property.id);
    logActivity("property_view", property.id);
  }, [property.id, logActivity]);

  const openLightbox = (i: number) => {
    setLightboxIdx(i);
    setLightboxOpen(true);
  };

  const handleCompare = () => {
    const r = toggle(property.id);
    if (!r.ok && r.reason) toast.error(r.reason);
    else if (!selectedFlag) {
      toast.success(`${property.name} added to compare`);
      logActivity("compare_add", property.id);
    }
  };

  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
    `Hi PropCompare, I'd like to know more about ${property.name} (${property.location}).`,
  )}`;

  const others = properties.filter((p) => p.id !== property.id).slice(0, 3);

  const prevMobileSlide = () => {
    setMobileSlideIdx((prev) => (prev - 1 + images.length) % images.length);
  };

  const nextMobileSlide = () => {
    setMobileSlideIdx((prev) => (prev + 1) % images.length);
  };

  return (
    <div className="min-h-screen">
      <div aria-hidden className="page-grain" />
      <SiteHeader />

      <main className="container-lux pt-24 pb-16 sm:pt-28">
        {/* Breadcrumb & Navigation */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-between"
        >
          <Link
            to="/"
            hash="collection"
            className="tracking-luxury inline-flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> The Collection
          </Link>
          <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase hidden sm:inline-block">
            {property.category}
          </span>
        </motion.div>

        {/* Page Title Header */}
        <motion.header
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.05 }}
          className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-block h-px w-6 bg-champagne/70" />
              <span className="tracking-luxury text-xs font-semibold uppercase text-champagne">
                {property.developer}
              </span>
              <span className="text-muted-foreground">•</span>
              <span className="rounded-full border border-[var(--rule)] bg-card px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground shadow-2xs">
                {property.status}
              </span>
            </div>
            <h1
              className="mt-3 font-display text-3xl font-bold leading-tight text-foreground sm:text-5xl"
              style={{ letterSpacing: "var(--tracking-display)" }}
            >
              {property.name}
            </h1>
            <p className="mt-2.5 inline-flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 text-champagne" /> {property.location}
            </p>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            <FavoriteButton
              propertyId={property.id}
              propertyName={property.name}
              propertyImage={property.image}
            />
            <button
              type="button"
              onClick={handleCompare}
              className={`tracking-luxury inline-flex h-11 items-center gap-2 rounded-full px-6 text-xs font-bold uppercase transition-all duration-300 ${
                selectedFlag
                  ? "bg-foreground text-background shadow-md"
                  : atMax
                    ? "bg-muted text-muted-foreground"
                    : "border border-border bg-card text-foreground hover:border-foreground/60 hover:bg-foreground hover:text-background"
              }`}
            >
              {selectedFlag ? (
                <>
                  <Check className="h-4 w-4" /> Added to Suite
                </>
              ) : (
                <>
                  <GitCompareArrows className="h-4 w-4" /> Add to compare
                </>
              )}
            </button>
          </div>
        </motion.header>

        {/* Photo Gallery — Mobile Carousel (< sm) & Desktop Asymmetrical Grid (sm+) */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.12 }}
          className="mt-8"
          aria-label="Photo gallery"
        >
          {/* Mobile Interactive Touch Slider (< sm) */}
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-[var(--rule)] bg-card sm:hidden">
            <AnimatePresence initial={false} mode="wait">
              <motion.img
                key={images[mobileSlideIdx]}
                src={images[mobileSlideIdx]}
                alt={property.name}
                initial={{ opacity: 0, scale: 1.05 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.4 }}
                className="absolute inset-0 h-full w-full object-cover"
                onClick={() => openLightbox(mobileSlideIdx)}
              />
            </AnimatePresence>

            {/* Mobile Controls */}
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous photo"
                  onClick={prevMobileSlide}
                  className="absolute left-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white backdrop-blur-md"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  aria-label="Next photo"
                  onClick={nextMobileSlide}
                  className="absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white backdrop-blur-md"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => openLightbox(mobileSlideIdx)}
              className="absolute bottom-3 right-3 z-20 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md"
            >
              <Expand className="h-3.5 w-3.5" /> {mobileSlideIdx + 1} / {images.length}
            </button>
          </div>

          {/* Desktop Mosaic Grid (sm+) */}
          <div className="hidden grid-cols-1 gap-3 sm:grid sm:grid-cols-[1.6fr_1fr] sm:grid-rows-2">
            <button
              type="button"
              onClick={() => openLightbox(0)}
              className="media-frame shine-host group/main relative aspect-[16/11] overflow-hidden rounded-2xl sm:row-span-2 sm:aspect-auto"
            >
              <img
                src={images[0]}
                alt={property.name}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover/main:scale-[1.04]"
                loading="eager"
                decoding="async"
              />
              <span aria-hidden className="shine" />
              <span className="tracking-luxury absolute bottom-4 left-4 z-10 inline-flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-xs font-semibold text-white backdrop-blur-md">
                <Expand className="h-4 w-4 text-champagne" /> View gallery · {images.length} photos
              </span>
            </button>
            {images.slice(1, 3).map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => openLightbox(i + 1)}
                className="media-frame group/thumb relative aspect-[16/10] overflow-hidden rounded-2xl sm:aspect-auto sm:min-h-[190px]"
              >
                <img
                  src={src}
                  alt={`${property.name} photo ${i + 2}`}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover/thumb:scale-[1.05]"
                  loading="lazy"
                  decoding="async"
                />
              </button>
            ))}
          </div>
        </motion.section>

        {/* Specifications Stat Bar */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6 }}
          className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[var(--rule)] bg-[var(--rule)] sm:grid-cols-4 shadow-sm"
        >
          <Fact
            icon={<Sparkles className="h-4 w-4 text-champagne" />}
            label="Configuration"
            value={property.configuration}
          />
          <Fact
            icon={<Ruler className="h-4 w-4 text-champagne" />}
            label="Size Range"
            value={property.size}
          />
          <Fact
            icon={<Calendar className="h-4 w-4 text-champagne" />}
            label="Possession Status"
            value={property.possession}
          />
          <Fact
            icon={<MessageCircle className="h-4 w-4 text-champagne" />}
            label="Starting Price"
            value={priceLabel(property)}
          />
        </motion.section>

        {/* Main Content Layout */}
        <div className="mt-14 grid grid-cols-1 gap-12 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-12">
            {/* What Sets It Apart */}
            {property.advantages.length > 0 && (
              <section className="rounded-2xl border border-[var(--rule)] bg-card p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <span className="h-px w-8 bg-champagne" />
                  <h2
                    className="font-display text-2xl font-bold text-foreground"
                    style={{ letterSpacing: "var(--tracking-display)" }}
                  >
                    What sets it apart
                  </h2>
                </div>
                <ul className="mt-6 space-y-4">
                  {property.advantages.map((a, i) => (
                    <motion.li
                      key={a}
                      initial={{ opacity: 0, x: -10 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, margin: "-40px" }}
                      transition={{ duration: 0.5, delay: i * 0.05 }}
                      className="flex items-start gap-4 border-b border-[var(--rule)] pb-4 text-sm text-foreground/90 leading-relaxed last:border-b-0 last:pb-0"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-champagne/10 border border-champagne/30 text-champagne text-xs font-bold font-display">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="pt-0.5">{a}</span>
                    </motion.li>
                  ))}
                </ul>
              </section>
            )}

            {/* Curated Amenities Compact Strip */}
            {property.amenities.length > 0 && (
              <section className="rounded-2xl border border-[var(--rule)] bg-card p-5 sm:p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="h-px w-6 bg-champagne" />
                    <h2
                      className="font-display text-lg font-bold text-foreground sm:text-xl"
                      style={{ letterSpacing: "var(--tracking-display)" }}
                    >
                      Curated Amenities
                    </h2>
                  </div>
                  <span className="rounded-full border border-champagne/30 bg-champagne/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-champagne">
                    {property.amenities.length} Highlights
                  </span>
                </div>

                <div className="mt-6 flex flex-wrap gap-x-5 gap-y-4 sm:gap-x-6 sm:gap-y-5">
                  {property.amenities.map((a) => {
                    const { Icon } = getAmenityMeta(a);
                    return (
                      <div
                        key={a}
                        className="group inline-flex items-center gap-3 rounded-full border border-[var(--rule-strong)] bg-background/60 px-5 py-3 text-xs sm:text-sm font-semibold text-foreground transition-all duration-200 hover:border-champagne/60 hover:bg-card hover:shadow-xs"
                      >
                        <span className="grid h-7 w-7 place-items-center rounded-full border border-champagne/30 bg-champagne/10 text-champagne transition-colors group-hover:bg-champagne group-hover:text-lux-black">
                          <Icon className="h-3.5 w-3.5 stroke-[2.2]" />
                        </span>
                        <span>{a}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Expert Advisory Perspective */}
            {property.expertNote && (
              <motion.blockquote
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.7 }}
                className="relative overflow-hidden rounded-2xl border border-[var(--rule)] bg-card p-8 sm:p-10 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="tracking-luxury text-xs font-semibold uppercase text-champagne">
                    PropCompare Advisory Perspective
                  </span>
                  <Quote className="h-6 w-6 text-champagne/40" />
                </div>
                <p className="mt-4 font-display text-lg sm:text-xl font-medium leading-relaxed text-foreground">
                  "{property.expertNote}"
                </p>
                <footer className="mt-6 flex items-center gap-3 border-t border-[var(--rule)] pt-4 text-xs text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-champagne" />
                  <span className="font-semibold uppercase tracking-luxury text-foreground">
                    Private Advisory Desk
                  </span>
                </footer>
              </motion.blockquote>
            )}
          </div>

          {/* Sticky Private Enquiry Desk */}
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-2xl border border-[var(--rule)] bg-card p-7 shadow-lg">
              <span className="tracking-luxury text-xs font-semibold uppercase text-champagne">
                Private Enquiry Desk
              </span>
              <h3 className="mt-2 font-display text-xl font-bold leading-snug text-foreground">
                Speak with our luxury property advisor
              </h3>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {hasPrice(property)
                  ? `The figure above is the starting price. Final pricing by layout, site visits, and availability for ${property.name} are confirmed privately by an advisor.`
                  : `Pricing, floor plan customization, and site visit schedules for ${property.name} are shared privately upon request.`}
              </p>

              <div className="mt-6 flex flex-col gap-3">
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => logActivity("contact_click", property.id)}
                  className="tracking-luxury inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-champagne px-6 text-xs font-bold uppercase text-lux-black transition hover:opacity-95 shadow-md"
                >
                  <MessageCircle className="h-4 w-4" /> Enquire on WhatsApp
                </a>

                <a
                  href={`tel:${PHONE_NUMBER}`}
                  className="tracking-luxury inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-[var(--rule)] bg-background px-6 text-xs font-bold uppercase text-foreground transition hover:border-foreground/40"
                >
                  <Phone className="h-4 w-4 text-champagne" /> Call Advisory Desk
                </a>

                <Link
                  to="/"
                  hash="collection"
                  className="tracking-luxury inline-flex h-10 w-full items-center justify-center gap-2 rounded-full text-xs font-medium text-muted-foreground transition hover:text-foreground mt-1"
                >
                  <GitCompareArrows className="h-3.5 w-3.5" /> Back to Comparison Suite
                </Link>
              </div>
            </div>
          </aside>
        </div>

        {/* Floor Plans & Layout Dimensions */}
        <ResidenceLayouts property={property} />

        {/* Continue Exploring Portfolio */}
        {others.length > 0 && (
          <section className="mt-20 border-t border-[var(--rule)] pt-12">
            <div className="flex items-center justify-between gap-4">
              <div>
                <span className="tracking-luxury text-xs font-semibold uppercase text-champagne">
                  Explore More
                </span>
                <h2
                  className="mt-1 font-display text-2xl sm:text-3xl font-bold text-foreground"
                  style={{ letterSpacing: "var(--tracking-display)" }}
                >
                  Similar residences in our portfolio
                </h2>
              </div>
            </div>
            <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
              {others.map((p) => (
                <Link
                  key={p.id}
                  to="/residence/$id"
                  params={{ id: p.id }}
                  className="group overflow-hidden rounded-2xl border border-[var(--rule)] bg-card transition hover:border-foreground/30 shadow-xs"
                >
                  <div className="media-frame relative aspect-[16/10] overflow-hidden">
                    <img
                      src={p.image}
                      alt={p.name}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1100ms] group-hover:scale-[1.05]"
                    />
                    <span className="absolute left-3 top-3 rounded-full border border-border/60 bg-background/90 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-foreground backdrop-blur-md">
                      {p.status}
                    </span>
                  </div>
                  <div className="p-5">
                    <p className="tracking-luxury text-[10px] font-semibold uppercase text-champagne">
                      {p.developer}
                    </p>
                    <p className="font-display text-lg font-bold text-foreground mt-0.5">
                      {p.name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground truncate">{p.location}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Mobile Sticky Quick Action Bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between border-t border-[var(--rule)] bg-card/95 p-3 px-4 backdrop-blur-md lg:hidden shadow-2xl">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Starting Price
          </p>
          <p className="font-display text-base font-bold text-champagne">{priceLabel(property)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCompare}
            className={`inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-xs font-bold uppercase transition ${
              selectedFlag
                ? "bg-foreground text-background"
                : "border border-champagne/40 bg-champagne/10 text-champagne"
            }`}
          >
            {selectedFlag ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <GitCompareArrows className="h-3.5 w-3.5" />
            )}
            {selectedFlag ? "In Suite" : "Compare"}
          </button>
          <a
            href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Hi PropCompare, I would like to inquire about ${property.name} (${property.location}).`)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-champagne px-4 text-xs font-bold uppercase text-lux-black shadow-md"
          >
            <MessageCircle className="h-3.5 w-3.5 stroke-[2.5]" /> Enquire
          </a>
        </div>
      </div>

      <SiteFooter />

      <Lightbox
        images={images}
        index={lightboxIdx}
        open={lightboxOpen}
        title={property.name}
        onClose={() => setLightboxOpen(false)}
        onIndexChange={setLightboxIdx}
      />
    </div>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5 bg-card p-5">
      <span className="tracking-luxury inline-flex items-center gap-2 text-[10px] font-semibold uppercase text-muted-foreground">
        {icon} {label}
      </span>
      <span className="font-display text-base font-bold text-foreground truncate">{value}</span>
    </div>
  );
}
