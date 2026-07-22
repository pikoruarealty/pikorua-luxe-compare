import type {
  Property,
  PropertyCategory,
  PropertyConfigurations,
  ConfigKey,
} from "@/types/property";
import { CONFIG_KEYS } from "@/types/property";
import { slug } from "@/lib/slug";
import {
  type RawRow,
  DEFAULT_CITY,
  DEFAULT_STATE,
  amenitiesFor,
  advantagesFor,
  expertNoteFor,
  taglineFor,
  summariseConfiguration,
  normalizePossession,
  parseNumeric,
  aggregateArea,
  buildPriceSummary,
} from "@/lib/property-derivations";
import raw from "./_raw.json";
import p1 from "@/assets/property-1.jpg";
import p2 from "@/assets/property-2.jpg";
import p3 from "@/assets/property-3.jpg";
import p4 from "@/assets/property-4.jpg";
import gLiving from "@/assets/gallery-living.jpg";
import gPool from "@/assets/gallery-pool.jpg";
import gClub from "@/assets/gallery-clubhouse.jpg";
import gBed from "@/assets/gallery-bedroom.jpg";
import anamikaCover from "@/assets/anamika-cover.jpg";
import anamikaExterior from "@/assets/anamika-exterior.jpg";
import anamikaHall from "@/assets/anamika-hall.png";
import anamikaBedroom from "@/assets/anamika-bedroom.jpg";
import anuritaCover from "@/assets/anurita-cover.jpg";
import anuritaExterior from "@/assets/anurita-exterior.jpg";
import anuritaLiving from "@/assets/anurita-living.jpg";
import anuritaBedroom from "@/assets/anurita-bedroom.jpg";
import atmanExterior from "@/assets/atman-exterior.jpg";
import atmanLobby from "@/assets/atman-lobby.jpg";
import avantExterior from "@/assets/avant-exterior.png";
import avantHall from "@/assets/avant-hall.jpg";
import avantPark from "@/assets/avant-park.avif";
import belagioExterior from "@/assets/belagio-exterior.jpg";
import belagioTower from "@/assets/belagio-tower.jpg";
import belagioLibrary from "@/assets/belagio-library.jpg";
import belagioPool from "@/assets/belagio-pool.jpg";
import belrosaExterior from "@/assets/belrosa-exterior.jpg";
import belrosaHall from "@/assets/belrosa-hall.jpg";
import belrosaView from "@/assets/belrosa-view.jpg";
import belrosaDining from "@/assets/belrosa-dining.jpg";
import capstoneCourtyard from "@/assets/capstone-courtyard.jpg";
import capstoneLiving from "@/assets/capstone-living.jpg";
import capstoneAerial from "@/assets/capstone-aerial.jpg";
import capstoneGameRoom from "@/assets/capstone-gameroom.jpg";
import capstoneHomeTheater from "@/assets/capstone-hometheater.jpg";
import capstoneKidsPlay from "@/assets/capstone-kidsplay.jpg";
import eminence96Exterior from "@/assets/eminence-96-exterior.png";
import eminence96Gym from "@/assets/eminence-96-gym.webp";
import eminence96Pool from "@/assets/eminence-96-pool.webp";
import eminence96Lounge from "@/assets/eminence-96-lounge.webp";
import ikebanaExterior from "@/assets/ikebana-exterior.png";
import ikebanaWardrobe from "@/assets/ikebana-wardrobe.png";
import ikebanaBedroom from "@/assets/ikebana-bedroom.png";
import ikebanaLiving from "@/assets/ikebana-living.png";
import kalravAlpinesExterior from "@/assets/kalrav-alpines-exterior.jpg";
import kimanaTowers from "@/assets/kimana-towers.jpg";
import kimanaLobby from "@/assets/kimana-lobby.jpg";
import kimanaDusk from "@/assets/kimana-tower-dusk.jpg";
import maruti360Exterior from "@/assets/maruti-360-exterior.jpeg";
import maruti360Bedroom from "@/assets/maruti-360-bedroom.png";
import maruti360PlayArea from "@/assets/maruti-360-play-area.png";
import maruti360Pool from "@/assets/maruti-360-pool.png";
import maruti360View from "@/assets/maruti-360-view.jpg";
import venusUniverse1 from "@/assets/venus-universe-1.jpeg";
import venusUniverse2 from "@/assets/venus-universe-2.jpeg";
import venusUniverse3 from "@/assets/venus-universe-3.jpeg";
import venusUniverse4 from "@/assets/venus-universe-4.jpeg";
import northparkExterior from "@/assets/northpark-exterior.jpg";
import northparkBungalow from "@/assets/northpark-bungalow.jpg";
import northparkHall from "@/assets/northpark-hall.jpg";
import northparkDining from "@/assets/northpark-dining.jpg";
import northparkBedroom from "@/assets/northpark-bedroom.jpg";
import pashminaCover from "@/assets/pashmina-cover.jpg";
import pashminaBedroom from "@/assets/pashmina-bedroom.jpeg";
import pashminaDining from "@/assets/pashmina-dining.jpg";
import pashminaLiving from "@/assets/pashmina-living.png";
import goyalRivieraExterior from "@/assets/goyal-riviera-exterior.jpeg";
import goyalRivieraBalcony from "@/assets/goyal-riviera-balcony.jpeg";
import amarisClubhouse from "@/assets/amaris-clubhouse.jpeg";
import amarisBalcony from "@/assets/amaris-balcony.jpeg";
import amarisAerial from "@/assets/amaris-aerial.jpeg";
import satyamevTowers from "@/assets/satyamev-luxor-towers.jpeg";
import satyamevCourtyard from "@/assets/satyamev-luxor-courtyard.jpeg";
import satyamevKids from "@/assets/satyamev-luxor-kids.jpeg";
import satyamevFirepit from "@/assets/satyamev-luxor-firepit.jpeg";
import theParkTowerDusk from "@/assets/the-park-tower-dusk.jpeg";
import theParkLiving from "@/assets/the-park-living.jpeg";
import theParkExterior from "@/assets/the-park-exterior.jpeg";
import rashmiExterior from "@/assets/rashmi-exterior.jpeg";
import rashmiLiving from "@/assets/rashmi-living.jpeg";
import rashmiBalcony from "@/assets/rashmi-balcony.jpeg";
import shaligramExterior from "@/assets/shaligram-luxuria-1.jpg";
import shaligramGym from "@/assets/shaligram-luxuria-2-gym.jpg";
import shaligramAerial from "@/assets/shaligram-luxuria-3.jpg";
import swatiHall from "@/assets/swati-senor-hall.jpg";
import swatiDining from "@/assets/swati-senor-dining.jpg";
import swatiGallery from "@/assets/swati-senor-gallery.jpg";
import swatiBedroom from "@/assets/swati-senor-bedroom.jpg";
import swatiPool from "@/assets/swati-senor-pool.jpg";
import triveniExterior from "@/assets/triveni-84-exterior.jpg";
import triveniKids from "@/assets/triveni-84-kids.jpeg";
import triveniYoga from "@/assets/triveni-84-yoga.jpeg";
import triveniGym from "@/assets/triveni-84-gym.jpeg";
import triveniBanquet from "@/assets/triveni-84-banquet.jpeg";
import vaikunthExterior from "@/assets/vaikunth-exterior.png";
import vaikunthPool from "@/assets/vaikunth-pool.png";
import vaikunthBungalow from "@/assets/vaikunth-bungalow.png";
import godrejAltusBalcony from "@/assets/godrej-altus-balcony.jpg";
import godrejAltusPool from "@/assets/godrej-altus-pool.jpg";
import godrejAltusFacade from "@/assets/godrej-altus-facade.jpg";
import westparkVilla from "@/assets/westpark-villa.jpeg";
import westparkBungalow from "@/assets/westpark-bungalow.jpg";

const sharedGallery = {
  livingRoom: gLiving,
  pool: gPool,
  clubhouse: gClub,
  masterBedroom: gBed,
};

const images = [p1, p2, p3, p4];

// Per-property image overrides (cover + gallery), keyed by slug.
const imageOverrides: Record<string, { cover?: string; gallery?: Partial<typeof sharedGallery> }> =
  {
    anamika: {
      cover: anamikaCover,
      gallery: {
        livingRoom: anamikaHall,
        masterBedroom: anamikaBedroom,
        pool: anamikaExterior,
        clubhouse: anamikaCover,
      },
    },
    anurita: {
      cover: anuritaCover,
      gallery: {
        livingRoom: anuritaLiving,
        masterBedroom: anuritaBedroom,
        pool: anuritaExterior,
        clubhouse: anuritaCover,
      },
    },
    atman: {
      cover: atmanExterior,
      gallery: {
        livingRoom: atmanLobby,
        masterBedroom: atmanLobby,
        pool: atmanExterior,
        clubhouse: atmanLobby,
      },
    },
    avant: {
      cover: avantExterior,
      gallery: {
        livingRoom: avantHall,
        masterBedroom: avantHall,
        pool: avantPark,
        clubhouse: avantPark,
      },
    },
    belagio: {
      cover: belagioExterior,
      gallery: {
        livingRoom: belagioLibrary,
        masterBedroom: belagioTower,
        pool: belagioPool,
        clubhouse: belagioLibrary,
      },
    },
    belrosa: {
      cover: belrosaExterior,
      gallery: {
        livingRoom: belrosaHall,
        masterBedroom: belrosaDining,
        pool: belrosaView,
        clubhouse: belrosaView,
      },
    },
    capstone: {
      cover: capstoneAerial,
      gallery: {
        livingRoom: capstoneLiving,
        masterBedroom: capstoneCourtyard,
        pool: capstoneCourtyard,
        clubhouse: capstoneGameRoom,
      },
    },
    "eminence-96": {
      cover: eminence96Exterior,
      gallery: {
        livingRoom: eminence96Lounge,
        masterBedroom: eminence96Lounge,
        pool: eminence96Pool,
        clubhouse: eminence96Gym,
      },
    },
    ikebana: {
      cover: ikebanaExterior,
      gallery: {
        livingRoom: ikebanaLiving,
        masterBedroom: ikebanaBedroom,
        pool: ikebanaExterior,
        clubhouse: ikebanaWardrobe,
      },
    },
    "goyal-riviera-select": {
      cover: goyalRivieraExterior,
      gallery: {
        livingRoom: goyalRivieraBalcony,
        masterBedroom: goyalRivieraBalcony,
        pool: goyalRivieraBalcony,
        clubhouse: goyalRivieraExterior,
      },
    },
    amaris: {
      cover: amarisClubhouse,
      gallery: {
        livingRoom: amarisBalcony,
        masterBedroom: amarisBalcony,
        pool: amarisAerial,
        clubhouse: amarisClubhouse,
      },
    },
    "satyamev-luxor": {
      cover: satyamevTowers,
      gallery: {
        livingRoom: satyamevCourtyard,
        masterBedroom: satyamevCourtyard,
        pool: satyamevFirepit,
        clubhouse: satyamevKids,
      },
    },
    "the-park": {
      cover: theParkTowerDusk,
      gallery: {
        livingRoom: theParkLiving,
        masterBedroom: theParkLiving,
        pool: theParkExterior,
        clubhouse: theParkExterior,
      },
    },
    rashmi: {
      cover: rashmiExterior,
      gallery: {
        livingRoom: rashmiLiving,
        masterBedroom: rashmiLiving,
        pool: rashmiBalcony,
        clubhouse: rashmiBalcony,
      },
    },
    "kalrav-alpines": {
      cover: kalravAlpinesExterior,
      gallery: {
        pool: kalravAlpinesExterior,
        clubhouse: kalravAlpinesExterior,
      },
    },
    kimana: {
      cover: kimanaTowers,
      gallery: {
        livingRoom: kimanaLobby,
        masterBedroom: kimanaDusk,
        pool: kimanaTowers,
        clubhouse: kimanaLobby,
      },
    },
    "maruti-360": {
      cover: maruti360Exterior,
      gallery: {
        livingRoom: maruti360View,
        masterBedroom: maruti360Bedroom,
        pool: maruti360Pool,
        clubhouse: maruti360PlayArea,
      },
    },
    "venus-universe": {
      cover: venusUniverse1,
      gallery: {
        livingRoom: venusUniverse3,
        masterBedroom: venusUniverse3,
        pool: venusUniverse2,
        clubhouse: venusUniverse4,
      },
    },
    northpark: {
      cover: northparkExterior,
      gallery: {
        livingRoom: northparkHall,
        masterBedroom: northparkBedroom,
        pool: northparkBungalow,
        clubhouse: northparkDining,
      },
    },
    pashmina: {
      cover: pashminaCover,
      gallery: {
        livingRoom: pashminaLiving,
        masterBedroom: pashminaBedroom,
        pool: pashminaDining,
        clubhouse: pashminaDining,
      },
    },
    "shaligram-luxuria": {
      cover: shaligramExterior,
      gallery: {
        livingRoom: shaligramExterior,
        masterBedroom: shaligramGym,
        pool: shaligramAerial,
        clubhouse: shaligramGym,
      },
    },
    "swati-senor": {
      cover: swatiGallery,
      gallery: {
        livingRoom: swatiHall,
        masterBedroom: swatiBedroom,
        pool: swatiPool,
        clubhouse: swatiDining,
      },
    },
    "triveni-84": {
      cover: triveniExterior,
      gallery: {
        livingRoom: triveniBanquet,
        masterBedroom: triveniYoga,
        pool: triveniGym,
        clubhouse: triveniKids,
      },
    },
    vaikunth: {
      cover: vaikunthExterior,
      gallery: {
        livingRoom: vaikunthBungalow,
        masterBedroom: vaikunthBungalow,
        pool: vaikunthPool,
        clubhouse: vaikunthPool,
      },
    },
    "godrej-altus": {
      cover: godrejAltusFacade,
      gallery: {
        livingRoom: godrejAltusBalcony,
        masterBedroom: godrejAltusBalcony,
        pool: godrejAltusPool,
        clubhouse: godrejAltusFacade,
      },
    },
    westpark: {
      cover: westparkVilla,
      gallery: {
        livingRoom: westparkBungalow,
        masterBedroom: westparkBungalow,
        pool: westparkVilla,
        clubhouse: westparkBungalow,
      },
    },
  };

const rawRows = raw as RawRow[];

export const properties: Property[] = rawRows.map((r, i) => {
  const cfgs: PropertyConfigurations = {};
  for (const k of CONFIG_KEYS) {
    const c = r.configs[k];
    if (c) cfgs[k as ConfigKey] = c;
  }
  const category = (r.type as PropertyCategory) || "Apartment";
  const isPlot = category === "Plots" || category === "Bungalow";

  const superBuiltUpArea = isPlot
    ? r.plotSuper
      ? `${r.plotSuper} Plot`
      : "-"
    : aggregateArea(cfgs, "area");
  const carpetArea = isPlot
    ? r.plotCarpet
      ? `${r.plotCarpet} Built-up`
      : "-"
    : aggregateArea(cfgs, "carpet");

  const sizeDisplay =
    superBuiltUpArea !== "-" && carpetArea !== "-"
      ? superBuiltUpArea
      : superBuiltUpArea !== "-"
        ? superBuiltUpArea
        : carpetArea;

  const id = slug(r.name);
  const ov = imageOverrides[id];

  return {
    id,
    name: r.name,
    developer: r.developer || "-",
    category,
    tagline: taglineFor(r),
    image: ov?.cover ?? images[i % images.length],
    size: sizeDisplay,
    sizeNumeric: parseNumeric(superBuiltUpArea),
    superBuiltUpArea,
    carpetArea,
    location: r.location || "-",
    city: r.city?.trim() || DEFAULT_CITY,
    state: r.state?.trim() || DEFAULT_STATE,
    status: r.status || "-",
    configuration: summariseConfiguration(cfgs, category),
    configurations: cfgs,
    pricePerSqft: buildPriceSummary(cfgs),
    possession: normalizePossession(r.possession),
    amenities: r.amenities?.length ? r.amenities : amenitiesFor(category),
    advantages: advantagesFor(r),
    gallery: { ...sharedGallery, ...(ov?.gallery ?? {}) },
    expertNote: expertNoteFor(r),
  };
});

export const getPropertyById = (id: string): Property | undefined =>
  properties.find((p) => p.id === id);
