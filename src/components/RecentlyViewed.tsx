import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { History } from "lucide-react";
import { usePropertyLookup } from "@/context/PropertiesContext";
import { getRecentlyViewed } from "@/lib/recently-viewed";
import type { Property } from "@/types/property";

/** "You were looking at…" strip — pulls returning visitors back into the funnel. */
export function RecentlyViewed() {
  const [items, setItems] = useState<Property[]>([]);
  const getPropertyById = usePropertyLookup();

  useEffect(() => {
    const list = getRecentlyViewed()
      .map((id) => getPropertyById(id))
      .filter((p): p is Property => Boolean(p))
      .slice(0, 4);
    setItems(list);
  }, [getPropertyById]);

  if (items.length === 0) return null;

  return (
    <section className="container-lux py-10">
      <div className="flex items-center gap-3">
        <History className="h-3.5 w-3.5 text-champagne" />
        <span className="text-[10px] tracking-luxury text-champagne">You were looking at</span>
        <span className="h-px flex-1 bg-champagne/15" />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {items.map((p, i) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-30px" }}
            transition={{ duration: 0.45, delay: i * 0.06 }}
          >
            <Link
              to="/residence/$id"
              params={{ id: p.id }}
              className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5 transition hover:border-foreground/35"
            >
              <div className="h-14 w-16 shrink-0 overflow-hidden rounded-xl">
                <img
                  src={p.image}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </div>
              <div className="min-w-0">
                <p className="descender-safe truncate font-display text-[14px] leading-tight text-ivory">
                  {p.name}
                </p>
                <p className="mt-0.5 truncate text-[10px] tracking-luxury text-muted-foreground">
                  {p.location}
                </p>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
