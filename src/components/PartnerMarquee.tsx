import { useMarqueeSpeed } from "@/hooks/use-marquee-speed";

// Existing asset imports as fallbacks/primary logos
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
  logo: string;
  width: number;
  height: number;
  projectName?: string;
  overrideClass?: string;
}

const PARTNERS: Partner[] = [
  { name: "Adani Realty", logo: "/partners/adani.png", width: 700, height: 140 },
  { name: "A. Shridhar", logo: "/partners/ashridhar.png", width: 600, height: 137 },
  {
    name: "The Capstone Developers",
    logo: "/partners/capstone.png",
    width: 300,
    height: 107,
    projectName: "Capstone",
  },
  { name: "Constera Realty", logo: "/partners/constera.png", width: 222, height: 50 },
  {
    name: "Gala Group",
    logo: "/partners/gala.png",
    width: 100,
    height: 133,
    overrideClass: "h-11 sm:h-12 max-w-[155px] scale-110",
  },
  { name: "Godrej Properties", logo: "/partners/godrej.png", width: 1783, height: 854 },
  { name: "Goyal & Co.", logo: "/partners/goyal.png", width: 139, height: 68 },
  { name: "HN Safal", logo: "/partners/hnsafal-dark.png", width: 300, height: 165 },
  {
    name: "Maruti Group",
    logo: "/partners/maruti-dark.png",
    width: 200,
    height: 52,
    projectName: "Maruti 360",
  },
  {
    name: "Ravi Desai Group",
    logo: "/partners/ravidesai.png",
    width: 2640,
    height: 733,
    overrideClass: "h-11 sm:h-12 max-w-[180px] scale-115",
  },
  { name: "Satyamev Group", logo: "/partners/satyamev.png", width: 500, height: 129 },
  {
    name: "Shaligram Group",
    logo: "/partners/shaligram.png",
    width: 600,
    height: 301,
    projectName: "Shaligram Luxuria",
  },
  { name: "Sun Builders", logo: "/partners/sun.png", width: 1200, height: 1314 },
  {
    name: "Swati Procon",
    logo: "/partners/swati.png",
    width: 1080,
    height: 142,
    projectName: "Swati Senor",
  },
  {
    name: "Triveni Group",
    logo: "/partners/triveni.png",
    width: 250,
    height: 139,
    projectName: "Triveni 84",
  },
  { name: "Venus Infrastructure", logo: "/partners/venus.png", width: 1418, height: 303 },
];

// Fallback asset mapping in case public PNGs are loading/missing
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
  const { trackRef, duration } = useMarqueeSpeed(110);
  const doubledPartners = [...PARTNERS, ...PARTNERS];

  return (
    <section
      className="partner-strip relative overflow-hidden border-y border-[var(--border)] bg-[var(--background)] py-6"
      aria-label="Developer Alliances"
    >
      {/* Edge gradient masks */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[var(--background)] to-transparent sm:w-40" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[var(--background)] to-transparent sm:w-40" />

      {/* Marquee Track */}
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
              className="bg-card mx-5 flex h-16 items-center justify-center rounded-card border border-[var(--border)] px-7 py-4 shadow-sm transition-all hover:border-[var(--border-strong)] sm:mx-6 shrink-0"
              aria-hidden={isDup ? true : undefined}
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
                className={`object-contain contrast-[1.1] brightness-[0.96] ${
                  partner.overrideClass || "h-9 sm:h-10 max-w-[155px]"
                }`}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

// Export as DeveloperAlliances for backward compatibility with imports
export { PartnerMarquee as DeveloperAlliances };
