import { motion } from "framer-motion";
import { MapPin, Ruler } from "lucide-react";
import type { Property } from "@/types/property";

interface PropertyHeaderCardsProps {
  properties: Property[];
}

export function PropertyHeaderCards({ properties }: PropertyHeaderCardsProps) {
  return (
    <div className="-mx-6 border-y border-(--glass-border) bg-lux-black/85 px-6 py-5">
      <div
        className="stack-sm grid gap-4"
        style={{ gridTemplateColumns: `repeat(${properties.length}, minmax(0, 1fr))` }}
      >
        {properties.map((p, i) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: i * 0.08 }}
            className="group overflow-hidden rounded-card border border-[var(--rule)]"
          >
            <div className="relative aspect-[16/10] overflow-hidden sm:aspect-[16/7]">
              <img
                src={p.image}
                alt={p.name}
                className="h-full w-full object-cover transition-transform duration-1000 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <div className="absolute bottom-2 left-2 right-2 sm:bottom-3 sm:left-3 sm:right-3">
                {/* Solid scrim, matching every other status pill on a photo. */}
                <span
                  className="tracking-luxury rounded-full bg-black/60 px-2 py-1 font-semibold text-white sm:px-3"
                  style={{ fontSize: "var(--step--2)" }}
                >
                  {p.status}
                </span>
              </div>
            </div>
            <div className="p-3 sm:p-4">
              <h3
                className="descender-safe truncate font-display font-bold leading-tight text-ivory"
                style={{ fontSize: "var(--step-1)", letterSpacing: "var(--tracking-display)" }}
              >
                {p.name}
              </h3>
              <div
                className="mt-1.5 flex flex-col gap-1 font-medium text-muted-foreground sm:mt-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1"
                style={{ fontSize: "var(--step--2)" }}
              >
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <Ruler className="h-3 w-3 shrink-0 text-foreground" />
                  <span className="truncate">{p.size}</span>
                </span>
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <MapPin className="h-3 w-3 shrink-0 text-foreground" />
                  <span className="truncate">{p.location}</span>
                </span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
