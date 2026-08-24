/**
 * Curated photography for the landing hero's 3D carousel.
 *
 * `src/assets/` holds ~117 project photographs. These are imported explicitly
 * rather than globbed so exactly this set ships in the landing chunk — a glob
 * over the directory would either bundle all 117 eagerly or hand back dynamic
 * importers that SSR cannot resolve during the first paint.
 *
 * Art direction lives here, not in the database. `heroImageUrl` on a published
 * property is whatever the developer supplied; these are chosen for the crop
 * and the light a portrait card needs.
 */
import kimanaTowerDusk from "@/assets/kimana-tower-dusk.jpg";
import theParkTowerDusk from "@/assets/the-park-tower-dusk.jpeg";
import godrejAltusFacade from "@/assets/godrej-altus-facade.jpg";
import satyamevLuxorTowers from "@/assets/satyamev-luxor-towers.jpeg";
import ikebanaExterior from "@/assets/ikebana-exterior.png";
import triveni84Exterior from "@/assets/triveni-84-exterior.jpg";
import belagioPool from "@/assets/belagio-pool.jpg";
import eminence96Pool from "@/assets/eminence-96-pool.webp";

export type LandingImage = {
  readonly src: string;
  /**
   * Empty by design. The ring is decorative and marked aria-hidden — the homes
   * themselves appear below with real names and data, so describing eight
   * photographs would only add noise for a screen reader.
   */
  readonly alt: "";
};

/**
 * The eight cards on the hero ring. Eight is the geometry the carousel CSS is
 * built around (`--card-radius` uses the N = 8 spacing factor), so changing the
 * length of this array means revisiting that factor too.
 *
 * Ordered so that adjacent cards contrast — dusk tower, daylight facade, water,
 * massing — rather than clustering similar crops next to each other.
 */
export const CAROUSEL: readonly LandingImage[] = [
  { src: kimanaTowerDusk, alt: "" },
  { src: godrejAltusFacade, alt: "" },
  { src: belagioPool, alt: "" },
  { src: satyamevLuxorTowers, alt: "" },
  { src: theParkTowerDusk, alt: "" },
  { src: ikebanaExterior, alt: "" },
  { src: eminence96Pool, alt: "" },
  { src: triveni84Exterior, alt: "" },
] as const;
