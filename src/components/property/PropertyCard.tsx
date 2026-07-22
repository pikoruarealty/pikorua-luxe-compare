import { motion } from "framer-motion";
import { Check, MapPin, Plus, Ruler } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { Property } from "@/types/property";
import { useCompareStore, MAX_COMPARE } from "@/stores/compare-store";
import { useHydrated } from "@/hooks/use-hydrated";
import { toast } from "sonner";
import { FavoriteButton } from "@/components/property/FavoriteButton";

interface PropertyCardProps {
  property: Property;
  index?: number;
}

export function PropertyCard({ property, index = 0 }: PropertyCardProps) {
  const hydrated = useHydrated();
  const { isSelected, toggle, selected } = useCompareStore();
  const selectedFlag = hydrated && isSelected(property.id);
  const atMax = hydrated && selected.length >= MAX_COMPARE && !selectedFlag;

  const handleToggle = () => {
    const result = toggle(property.id);
    if (!result.ok && result.reason) toast.error(result.reason);
    else if (!selectedFlag) toast.success(`${property.name} added to compare`);
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay: Math.min(index, 5) * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className="group relative overflow-hidden rounded-[32px] bg-card hover-lift"
      style={{
        border: "1px solid var(--glass-border)",
        contentVisibility: "auto",
        containIntrinsicSize: "520px",
      }}
    >
      <Link to="/" className="block">
        <div className="relative aspect-[4/3] overflow-hidden">
          <img
            src={property.image}
            alt={property.name}
            loading={index < 3 ? "eager" : "lazy"}
            fetchPriority={index === 0 ? "high" : "auto"}
            decoding="async"
            width={1280}
            height={896}
            className="h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
          <div className="absolute top-5 left-5">
            <span className="glass rounded-full px-4 py-1.5 text-[11px] tracking-luxury text-champagne">
              {property.status}
            </span>
          </div>
          <div className="absolute top-5 right-5">
            <FavoriteButton
              propertyId={property.id}
              propertyName={property.name}
              propertyImage={property.image}
            />
          </div>
        </div>
      </Link>

      <div className="p-7">
        <p className="text-[10px] tracking-luxury text-muted-foreground">
          {property.configuration}
        </p>
        <h3 className="mt-2 font-display text-2xl text-ivory">{property.name}</h3>
        <p className="mt-0.5 text-[11px] tracking-luxury text-champagne">{property.developer}</p>
        <p className="mt-1 text-sm text-muted-foreground line-clamp-1">{property.tagline}</p>

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ivory/80">
          <span className="inline-flex items-center gap-1.5">
            <Ruler className="h-3.5 w-3.5 text-champagne" /> {property.size}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-champagne" /> {property.location}
          </span>
        </div>

        <button
          onClick={handleToggle}
          className={`mt-7 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-xs tracking-luxury transition-all duration-300 ${
            selectedFlag
              ? "bg-champagne text-lux-black shadow-[0_10px_30px_-10px_rgba(200,164,93,0.6)]"
              : atMax
                ? "bg-graphite text-muted-foreground hover:text-foreground"
                : "gold-border text-champagne hover:bg-champagne hover:text-lux-black"
          }`}
        >
          {selectedFlag ? (
            <>
              <Check className="h-4 w-4" /> Added to Compare
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" /> Add to Compare
            </>
          )}
        </button>
      </div>
    </motion.article>
  );
}
