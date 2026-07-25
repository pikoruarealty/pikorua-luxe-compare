import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Calendar,
  Check,
  Expand,
  GitCompareArrows,
  MapPin,
  MessageCircle,
  Quote,
  Ruler,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useProperties, usePropertyLookup } from "@/context/PropertiesContext";
import type { Property } from "@/types/property";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Lightbox } from "@/components/Lightbox";
import { FavoriteButton } from "@/components/property/FavoriteButton";
import { MAX_COMPARE, useCompareStore } from "@/stores/compare-store";
import { ResidenceLayouts } from "@/components/residence/ResidenceLayouts";
import { useHydrated } from "@/hooks/use-hydrated";
import { useActivityLog } from "@/hooks/use-activity-log";
import { recordView } from "@/lib/recently-viewed";

const WHATSAPP_NUMBER = "916354359222";

export const Route = createFileRoute("/residence/$id")({
  head: () => ({
    meta: [
      { title: "Residence — Pikorua" },
      {
        name: "description",
        content: "Explore this residence in detail — gallery, amenities and expert perspective.",
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
  const { id } = Route.useParams();
  const getPropertyById = usePropertyLookup();
  const property = getPropertyById(id);

  if (!property) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-6 text-center">
          <p className="text-[11px] tracking-luxury text-champagne">Not found</p>
          <h1 className="mt-4 font-display text-4xl text-ivory">
            This residence isn't in our portfolio
          </h1>
          <Link
            to="/"
            className="mt-8 inline-flex items-center gap-2 rounded-full gold-border px-6 py-3 text-xs tracking-luxury text-champagne hover:bg-champagne hover:text-lux-black"
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
    `Hi PIKORUA, I'd like to know more about ${property.name} (${property.location}).`,
  )}`;

  const others = properties.filter((p) => p.id !== property.id).slice(0, 3);

  return (
    <div className="min-h-screen">
      <div aria-hidden className="page-grain" />
      <SiteHeader />

      <main className="container-lux pt-24 pb-10 sm:pt-28">
        {/* Breadcrumb */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Link
            to="/"
            hash="collection"
            className="inline-flex items-center gap-2 text-[11px] tracking-luxury text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> The Collection
          </Link>
        </motion.div>

        {/* Title */}
        <motion.header
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.05 }}
          className="mt-6 flex flex-wrap items-end justify-between gap-6"
        >
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-[10px] tracking-luxury text-champagne">
              <span className="inline-block h-px w-6 bg-champagne/70" />
              {property.developer} · {property.status}
            </p>
            <h1 className="mt-3 font-display text-[42px] leading-[1.02] text-ivory sm:text-[64px]">
              {property.name}
            </h1>
            <p className="mt-3 inline-flex items-center gap-2 text-[14px] text-muted-foreground">
              <MapPin className="h-4 w-4" /> {property.location}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <FavoriteButton
              propertyId={property.id}
              propertyName={property.name}
              propertyImage={property.image}
            />
            <button
              onClick={handleCompare}
              className={`inline-flex items-center gap-2 rounded-full px-6 py-3 text-xs tracking-luxury transition-all duration-300 ${
                selectedFlag
                  ? "bg-champagne text-lux-black"
                  : atMax
                    ? "bg-graphite text-muted-foreground hover:text-foreground"
                    : "gold-border text-champagne hover:bg-champagne hover:text-lux-black"
              }`}
            >
              {selectedFlag ? (
                <>
                  <Check className="h-4 w-4" /> In comparison
                </>
              ) : (
                <>
                  <GitCompareArrows className="h-4 w-4" /> Add to compare
                </>
              )}
            </button>
          </div>
        </motion.header>

        {/* Gallery mosaic */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.12 }}
          className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-[1.6fr_1fr] sm:grid-rows-2"
          aria-label="Photo gallery"
        >
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
            <span className="absolute bottom-4 left-4 z-10 inline-flex items-center gap-2 rounded-full bg-black/55 px-4 py-2 text-[10px] tracking-luxury text-white backdrop-blur">
              <Expand className="h-3.5 w-3.5" /> View gallery · {images.length}
            </span>
          </button>
          {images.slice(1, 3).map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => openLightbox(i + 1)}
              className="media-frame group/thumb relative hidden aspect-[16/10] overflow-hidden rounded-2xl sm:block sm:aspect-auto sm:min-h-[180px]"
            >
              <img
                src={src}
                alt={`${property.name} — photo ${i + 2}`}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover/thumb:scale-[1.05]"
                loading="lazy"
                decoding="async"
              />
            </button>
          ))}
        </motion.section>

        {/* Facts band */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6 }}
          className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-4"
        >
          <Fact
            icon={<Sparkles className="h-4 w-4" />}
            label="Configuration"
            value={property.configuration}
          />
          <Fact icon={<Ruler className="h-4 w-4" />} label="Size" value={property.size} />
          <Fact
            icon={<Calendar className="h-4 w-4" />}
            label="Possession"
            value={property.possession}
          />
          <Fact icon={<MessageCircle className="h-4 w-4" />} label="Pricing" value="On Request" />
        </motion.section>

        <div className="mt-14 grid grid-cols-1 gap-12 lg:grid-cols-[1.5fr_1fr]">
          <div>
            {/* Advantages */}
            {property.advantages.length > 0 && (
              <section>
                <h2 className="font-display text-[26px] text-ivory sm:text-[32px]">
                  What sets it apart
                </h2>
                <ul className="mt-6 space-y-4">
                  {property.advantages.map((a, i) => (
                    <motion.li
                      key={a}
                      initial={{ opacity: 0, x: -10 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, margin: "-40px" }}
                      transition={{ duration: 0.5, delay: i * 0.05 }}
                      className="flex gap-4 border-b border-border/60 pb-4 text-[15px] leading-relaxed text-foreground/85"
                    >
                      <span className="font-display text-[15px] text-champagne tabular-nums">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {a}
                    </motion.li>
                  ))}
                </ul>
              </section>
            )}

            {/* Amenities */}
            {property.amenities.length > 0 && (
              <section className="mt-12">
                <h2 className="font-display text-[26px] text-ivory sm:text-[32px]">Amenities</h2>
                <div className="mt-6 flex flex-wrap gap-2">
                  {property.amenities.map((a) => (
                    <span
                      key={a}
                      className="rounded-full border border-border bg-card px-4 py-2 text-[12px] text-foreground/85"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Expert note */}
            {property.expertNote && (
              <motion.blockquote
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.7 }}
                className="glass mt-12 rounded-[28px] p-8 sm:p-10"
              >
                <Quote className="h-6 w-6 text-champagne/60" />
                <p className="mt-4 font-display text-[22px] leading-snug text-ivory sm:text-[26px]">
                  {property.expertNote}
                </p>
                <footer className="mt-5 text-[10px] tracking-luxury text-champagne">
                  Pikorua · Private Advisory
                </footer>
              </motion.blockquote>
            )}
          </div>

          {/* Enquiry card */}
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-[28px] border border-border bg-card p-7 shadow-(--shadow-glass)">
              <p className="text-[10px] tracking-luxury text-champagne">Private enquiry</p>
              <h3 className="mt-2 font-display text-[24px] leading-tight text-ivory">
                Speak with our advisory desk
              </h3>
              <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                Pricing, availability and site visits for {property.name} are shared privately. Our
                advisors reply within the hour.
              </p>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => logActivity("contact_click", property.id)}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[11px] font-semibold tracking-luxury transition hover:brightness-110"
                style={{ background: "var(--brand)", color: "var(--brand-ink)" }}
              >
                <MessageCircle className="h-4 w-4" /> Enquire on WhatsApp
              </a>
              <Link
                to="/"
                hash="suite"
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-border px-6 py-3.5 text-[11px] tracking-luxury text-foreground transition hover:border-foreground/40"
              >
                <GitCompareArrows className="h-4 w-4" /> Open comparison suite
              </Link>
            </div>
          </aside>
        </div>

        {/* This residence's own layouts, side by side */}
        <ResidenceLayouts property={property} />

        {/* More residences */}
        {others.length > 0 && (
          <section className="mt-20">
            <div className="flex items-center gap-4">
              <h2 className="font-display text-[24px] text-ivory sm:text-[28px]">
                Continue exploring
              </h2>
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-3">
              {others.map((p) => (
                <Link
                  key={p.id}
                  to="/residence/$id"
                  params={{ id: p.id }}
                  className="group overflow-hidden rounded-2xl border border-border bg-card transition hover:border-foreground/30"
                >
                  <div className="media-frame relative aspect-[16/10] overflow-hidden">
                    <img
                      src={p.image}
                      alt={p.name}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1100ms] group-hover:scale-[1.05]"
                    />
                  </div>
                  <div className="p-4">
                    <p className="font-display text-[17px] leading-tight text-ivory">{p.name}</p>
                    <p className="mt-1 truncate text-[11px] tracking-luxury text-muted-foreground">
                      {p.location}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

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
    <div className="flex flex-col gap-2 bg-card p-5">
      <span className="inline-flex items-center gap-2 text-[9px] tracking-luxury text-muted-foreground">
        {icon} {label}
      </span>
      <span className="font-display text-[16px] leading-tight text-foreground">{value}</span>
    </div>
  );
}
