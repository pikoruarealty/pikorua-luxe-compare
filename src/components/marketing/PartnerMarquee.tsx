import { useMarqueeSpeed } from "@/hooks/use-marquee-speed";

// Fallback JPEG assets — used when public PNG variant fails to load
import venus from "@/assets/logos/1.jpeg";
import aShridhar from "@/assets/logos/2.jpeg";
import capstone from "@/assets/logos/3.jpeg";
import constera from "@/assets/logos/4.jpeg";
import gala from "@/assets/logos/5.jpeg";
import godrej from "@/assets/logos/6.jpeg";
import goyal from "@/assets/logos/7.jpeg";
import hnSafal from "@/assets/logos/8.jpeg";
import maruti from "@/assets/logos/9.jpeg";
import raviDesai from "@/assets/logos/10.jpeg";
import satyamev from "@/assets/logos/11.jpeg";
import shaligram from "@/assets/logos/12.jpeg";
import sun from "@/assets/logos/13.jpeg";
import swati from "@/assets/logos/14.jpeg";
import triveni from "@/assets/logos/15.jpeg";
import adani from "@/assets/logos/16.jpeg";

interface Partner {
  name: string;
  /** Public PNG path — served from /public/partners/ */
  logo: string;
  width: number;
  height: number;
  overrideClass?: string;
}

const PARTNERS: Partner[] = [
  { name: "Adani Realty", logo: "/partners/adani.png", width: 700, height: 140 },
  { name: "A. Shridhar", logo: "/partners/ashridhar.png", width: 600, height: 137 },
  { name: "The Capstone Developers", logo: "/partners/capstone.png", width: 300, height: 107 },
  { name: "Constera Realty", logo: "/partners/constera.png", width: 222, height: 50 },
  {
    name: "Gala Group",
    logo: "/partners/gala.png",
    width: 100,
    height: 133,
    overrideClass: "h-10 sm:h-11 max-w-[120px]",
  },
  { name: "Godrej Properties", logo: "/partners/godrej.png", width: 1783, height: 854 },
  { name: "Goyal & Co.", logo: "/partners/goyal.png", width: 139, height: 68 },
  { name: "HN Safal", logo: "/partners/hnsafal.png", width: 300, height: 165 },
  { name: "Maruti Group", logo: "/partners/maruti.png", width: 200, height: 52 },
  {
    name: "Ravi Desai Group",
    logo: "/partners/ravidesai.png",
    width: 2640,
    height: 733,
    overrideClass: "h-9 sm:h-10 max-w-[160px]",
  },
  { name: "Satyamev Group", logo: "/partners/satyamev.png", width: 500, height: 129 },
  {
    name: "Shaligram Group",
    logo: "/partners/shaligram.png",
    width: 600,
    height: 301,
    overrideClass: "h-10 sm:h-11 max-w-[150px]",
  },
  {
    name: "Sun Builders",
    logo: "/partners/sun.png",
    width: 1200,
    height: 1314,
    overrideClass: "h-10 sm:h-11 max-w-[60px]",
  },
  { name: "Swati Procon", logo: "/partners/swati.png", width: 1080, height: 142 },
  {
    name: "Triveni Group",
    logo: "/partners/triveni.png",
    width: 250,
    height: 139,
    overrideClass: "h-10 sm:h-11 max-w-[130px]",
  },
  { name: "Venus Infrastructure", logo: "/partners/venus.png", width: 1418, height: 303 },
];

const FALLBACK_LOGOS: Record<string, string> = {
  "Adani Realty": adani,
  "A. Shridhar": aShridhar,
  "The Capstone Developers": capstone,
  "Constera Realty": constera,
  "Gala Group": gala,
  "Godrej Properties": godrej,
  "Goyal & Co.": goyal,
  "HN Safal": hnSafal,
  "Maruti Group": maruti,
  "Ravi Desai Group": raviDesai,
  "Satyamev Group": satyamev,
  "Shaligram Group": shaligram,
  "Sun Builders": sun,
  "Swati Procon": swati,
  "Triveni Group": triveni,
  "Venus Infrastructure": venus,
};

export function PartnerMarquee() {
  const { trackRef, duration } = useMarqueeSpeed(100);
  const doubledPartners = [...PARTNERS, ...PARTNERS];

  return (
    <section
      className="partner-strip relative overflow-hidden bg-[var(--background)] py-8 sm:py-10"
      aria-label="Developer Alliances"
    >
      {/* Eyebrow label — centered above the track, matches reference */}
      <p className="mb-5 text-center text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--champagne-gold)] opacity-80 sm:mb-6">
        Developer Alliances
      </p>

      {/* Edge gradient masks — fade to dark canvas on both sides */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[var(--background)] to-transparent sm:w-40" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[var(--background)] to-transparent sm:w-40" />

      {/* Marquee track */}
      <div
        ref={trackRef}
        className="partner-track animate-marquee-continuous flex items-center w-max"
        style={
          duration ? ({ "--marquee-duration": `${duration}s` } as React.CSSProperties) : undefined
        }
      >
        {doubledPartners.map((partner, idx) => {
          const isDup = idx >= PARTNERS.length;
          return (
            <div
              key={`${partner.name}-${idx}`}
              aria-hidden={isDup ? true : undefined}
              title={partner.name}
              /* Cream/ivory pill card — matches the reference image style */
              className="mx-2.5 flex h-16 w-40 shrink-0 items-center justify-center rounded-xl bg-[#ede9df] px-5 py-3 sm:mx-3 sm:h-[72px] sm:w-48"
            >
              <img
                src={partner.logo}
                alt={isDup ? "" : partner.name}
                width={partner.width}
                height={partner.height}
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  const fallback = FALLBACK_LOGOS[partner.name];
                  if (fallback && e.currentTarget.src !== fallback) {
                    e.currentTarget.src = fallback;
                  }
                }}
                className={`object-contain ${partner.overrideClass || "h-8 sm:h-9 max-w-[148px]"}`}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

// Backward-compatible alias
export { PartnerMarquee as DeveloperAlliances };
