import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { MIN_COMPARE, useCompareStore } from "@/stores/compare-store";
import { usePropertyLookup } from "@/context/PropertiesContext";

import { useHydrated } from "@/hooks/use-hydrated";

export function CompareBar() {
  const hydrated = useHydrated();
  const getPropertyById = usePropertyLookup();
  const { selected: rawSelected, remove, clear } = useCompareStore();
  const selected = hydrated ? rawSelected : [];
  const canCompare = selected.length >= MIN_COMPARE;
  const visible = selected.length > 0;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-x-3 bottom-3 z-50 sm:inset-x-6 sm:bottom-6"
        >
          <div className="glass-strong mx-auto flex max-w-6xl flex-col items-stretch gap-4 rounded-[32px] p-4 sm:flex-row sm:items-center sm:p-5">
            <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto">
              <span className="hidden shrink-0 text-[10px] tracking-luxury text-champagne sm:inline">
                Compare ({selected.length}/3)
              </span>
              <div className="flex gap-3">
                {selected.map((id) => {
                  const p = getPropertyById(id);
                  if (!p) return null;
                  return (
                    <motion.div
                      key={id}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      className="group relative shrink-0"
                    >
                      <div className="flex items-center gap-3 rounded-2xl bg-graphite/60 p-2 pr-4">
                        <img
                          src={p.image}
                          alt={p.name}
                          className="h-12 w-12 rounded-xl object-cover"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ivory">{p.name}</p>
                          <p className="truncate text-[10px] tracking-luxury text-muted-foreground">
                            {p.location}
                          </p>
                        </div>
                        <button
                          aria-label={`Remove ${p.name}`}
                          onClick={() => remove(id)}
                          className="ml-2 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-soft-black text-muted-foreground transition-colors hover:bg-champagne hover:text-lux-black"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <button
                onClick={clear}
                className="text-[10px] tracking-luxury text-muted-foreground transition-colors hover:text-champagne"
              >
                Clear
              </button>
              {canCompare ? (
                <Link
                  to="/compare"
                  search={{ ids: selected.join(",") }}
                  className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-champagne to-muted-gold px-6 py-3 text-xs tracking-luxury text-lux-black shadow-[0_10px_30px_-10px_rgba(200,164,93,0.6)] transition-transform hover:scale-[1.02]"
                >
                  Compare Now
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              ) : (
                <span className="rounded-full bg-graphite px-5 py-3 text-[10px] tracking-luxury text-muted-foreground">
                  Select {MIN_COMPARE - selected.length} more
                </span>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
