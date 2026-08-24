/**
 * One-off generator for the static brand assets in `public/`.
 *
 * Run manually and COMMIT the output — this is deliberately not wired into
 * `vite build`, so build time stays flat and the artefacts are reviewable in
 * the diff like any other asset.
 *
 *   bun run scripts/generate-brand-assets.ts
 *
 * Produces:
 *   public/favicon-96.png       raster fallback for browsers without SVG icons
 *   public/apple-touch-icon.png 180x180, opaque (iOS composites alpha to black)
 *   public/og-image.jpg         1200x630 social card
 *
 * No text is composited into the OG image on purpose. sharp rasterises SVG
 * text through its bundled librsvg, which resolves fonts from the HOST system —
 * it would look correct on a dev machine and fall back to a different face (or
 * drop entirely) inside the Alpine build container. `og:title` already carries
 * the words.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const FAVICON = path.join(PUBLIC_DIR, "favicon.svg");

/** The OG card uses the same dusk tower that opens the landing hero. */
const OG_SOURCE = path.join(ROOT, "src", "assets", "kimana-tower-dusk.jpg");

/** Ink plate behind the touch icon — iOS will not honour transparency. */
const INK = { r: 0x13, g: 0x13, b: 0x13, alpha: 1 };

async function main() {
  await mkdir(PUBLIC_DIR, { recursive: true });

  await sharp(FAVICON, { density: 384 })
    .resize(96, 96, { fit: "contain", background: { ...INK, alpha: 0 } })
    .png()
    .toFile(path.join(PUBLIC_DIR, "favicon-96.png"));

  await sharp(FAVICON, { density: 384 })
    .resize(180, 180, { fit: "contain", background: INK })
    .flatten({ background: INK })
    .png()
    .toFile(path.join(PUBLIC_DIR, "apple-touch-icon.png"));

  await sharp(OG_SOURCE)
    .resize(1200, 630, { fit: "cover", position: "attention" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(path.join(PUBLIC_DIR, "og-image.jpg"));

  console.log("Wrote favicon-96.png, apple-touch-icon.png, og-image.jpg");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
