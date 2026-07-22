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

interface Alliance {
  name: string;
  logo: string;
}

const ALLIANCES: Alliance[] = [
  { name: "Constéra", logo: constera },
  { name: "Gala", logo: gala },
  { name: "Godrej", logo: godrej },
  { name: "Goyal & Co.", logo: goyal },
  { name: "HN Safal", logo: hnSafal },
  { name: "Maruti", logo: maruti },
  { name: "Ravi Desai", logo: raviDesai },
  { name: "Satyamev", logo: satyamev },
  { name: "Shaligram Group", logo: shaligram },
  { name: "Sun", logo: sun },
  { name: "Swati", logo: swati },
  { name: "Triveni Infra Build", logo: triveni },
  { name: "Adani Realty", logo: adani },
  { name: "Venus", logo: venus },
  { name: "A. Shridhar", logo: aShridhar },
  { name: "The Capstone Developers", logo: capstone },
];

/** Infinite scrolling strip of partner-developer logo cards. Pauses on hover. */
export function DeveloperAlliances() {
  const row = (key: string) => (
    <div key={key} className="alliance-row" aria-hidden={key === "b"}>
      {ALLIANCES.map((d, i) => (
        <div key={`${key}-${i}`} className="alliance-card">
          <img src={d.logo} alt={d.name} loading="lazy" />
        </div>
      ))}
    </div>
  );

  return (
    <section className="alliance-strip" aria-label="Developer alliances">
      <div className="alliance-track">
        {row("a")}
        {row("b")}
      </div>
    </section>
  );
}
