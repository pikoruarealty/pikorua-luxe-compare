/**
 * Curated photography for the landing page.
 *
 * `src/assets/` holds ~117 project photographs. These are imported explicitly
 * rather than globbed so exactly this set ships in the landing chunk — a glob
 * over the directory would either bundle all 117 eagerly or hand back dynamic
 * importers that SSR cannot resolve during the first paint.
 *
 * Art direction lives here, not in the database. `heroImageUrl` on a published
 * property is whatever the developer supplied; these are chosen for the crop
 * and the light each placement needs.
 */
import kimanaTowerDusk from "@/assets/kimana-tower-dusk.jpg";
import theParkTowerDusk from "@/assets/the-park-tower-dusk.jpeg";
import godrejAltusFacade from "@/assets/godrej-altus-facade.jpg";
import satyamevLuxorTowers from "@/assets/satyamev-luxor-towers.jpeg";
import ikebanaExterior from "@/assets/ikebana-exterior.png";
import triveni84Exterior from "@/assets/triveni-84-exterior.jpg";
import belagioPool from "@/assets/belagio-pool.jpg";
import eminence96Pool from "@/assets/eminence-96-pool.webp";
import capstoneAerial from "@/assets/capstone-aerial.jpg";
import northparkExterior from "@/assets/northpark-exterior.jpg";
import maruti360Exterior from "@/assets/maruti-360-exterior.jpeg";
import avantPark from "@/assets/avant-park.avif";

export type LandingImage = {
  readonly src: string;
  /** Empty only where the image is decorative and its container is aria-hidden. */
  readonly alt: string;
};

/**
 * The eight cards on the hero ring. Eight is the geometry the carousel CSS is
 * built around (`--card-radius` uses the N = 8 spacing factor), so changing the
 * length of this array means revisiting that factor too.
 *
 * Ordered so adjacent cards contrast — dusk tower, daylight facade, water,
 * massing — rather than clustering similar crops together.
 *
 * `alt` is empty by design: the ring is decorative and marked aria-hidden, so
 * describing eight photographs would only add noise for a screen reader.
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

/**
 * The staggered grid near the foot of the page. Chosen to not repeat the ring
 * above, and captioned properly because these become links to the residences
 * themselves — at which point the alt text is carrying real meaning.
 */
export const SHOWCASE_GRID: readonly LandingImage[] = [
  { src: capstoneAerial, alt: "Capstone masterplan photographed from the air" },
  { src: northparkExterior, alt: "Northpark bungalow exterior and driveway" },
  { src: avantPark, alt: "Avant's landscaped park between the towers" },
  { src: maruti360Exterior, alt: "Maruti 360 tower exterior at golden hour" },
] as const;
