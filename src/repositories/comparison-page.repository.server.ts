import { eq, inArray } from "drizzle-orm";

import { getDatabase } from "@/db/client.server";
import { properties, propertyPublicationVersions } from "@/db/schema";

export async function findSafeComparisonIdentities(slugs: string[]) {
  const db = getDatabase();
  const rows = await db
    .select({ slug: properties.slug, snapshot: propertyPublicationVersions.publicSnapshot })
    .from(properties)
    .innerJoin(
      propertyPublicationVersions,
      eq(properties.currentPublicationVersionId, propertyPublicationVersions.id),
    )
    .where(inArray(properties.slug, slugs));
  const names = new Map(
    rows.map((row) => {
      const snapshot = row.snapshot as { name?: unknown };
      const name =
        typeof snapshot.name === "string" && snapshot.name.trim()
          ? snapshot.name.trim()
          : "Approved project";
      return [row.slug, name] as const;
    }),
  );
  return slugs.flatMap((slug) => {
    const name = names.get(slug);
    return name ? [{ slug, name }] : [];
  });
}
