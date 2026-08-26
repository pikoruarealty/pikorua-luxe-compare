/**
 * Diagnostic for Phase C6: `republish-with-presentation.ts`'s dry run matched
 * only 12 of 24 live V2 properties to a V1 row by `slug`. This prints both
 * sides — V2's unmatched (slug, name) and every V1 (slug, name) — so the
 * mismatch pattern can be read off directly rather than guessed at. It writes
 * nothing and is not part of the republish path.
 *
 *   bun scripts/diagnose-slug-mismatch.ts
 */
import { and, eq, isNotNull } from "drizzle-orm";

import { getDatabase } from "@/db/client.server";
import { properties } from "@/db/schema";

async function main() {
  const db = getDatabase();
  const live = await db
    .select({ slug: properties.slug, name: properties.name })
    .from(properties)
    .where(and(eq(properties.isPublished, true), isNotNull(properties.currentPublicationVersionId)))
    .orderBy(properties.slug);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("properties")
    .select("slug, name")
    .order("slug", { ascending: true });
  if (error) throw new Error(`Couldn't read Supabase properties: ${error.message}`);
  const v1: { slug: string; name: string | null }[] = (data ?? []) as never;
  const v1SlugSet = new Set(v1.map((row) => row.slug));

  const unmatched = live.filter((row) => !v1SlugSet.has(row.slug));

  console.log(
    `V2 live: ${live.length}  |  V1: ${v1.length}  |  V2 unmatched by slug: ${unmatched.length}\n`,
  );

  console.log("--- V2 rows with no V1 row at that slug (slug | name) ---");
  for (const row of unmatched) console.log(`  ${row.slug}  |  ${row.name}`);

  console.log("\n--- All V1 rows (slug | name) ---");
  for (const row of v1) console.log(`  ${row.slug}  |  ${row.name}`);

  // Best-effort suggestion only — normalized-name match, printed for a human
  // to check, not applied anywhere.
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  console.log("\n--- Suggested matches by normalized name (verify before trusting) ---");
  for (const row of unmatched) {
    const candidate = v1.find((v) => v.name && norm(v.name) === norm(row.name));
    console.log(
      `  V2 ${row.slug} (${row.name})  ->  ${
        candidate ? `V1 ${candidate.slug} (${candidate.name})` : "NO MATCH"
      }`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
