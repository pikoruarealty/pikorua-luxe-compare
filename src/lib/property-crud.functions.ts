import { createServerFn } from "@tanstack/react-start";
import { requireOwnerAuth } from "@/integrations/supabase/admin-auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import type { PropertyConfigurations } from "@/types/property";
import { propertyFormSchema, type PropertyFormValues } from "./property-schema";
import { slug as slugify } from "./slug";
import type { PropertyRowInsert } from "./property-write.server";

/** JSONB columns are typed as Json; our richer shapes serialise cleanly into them. */
const toDbRow = (row: PropertyRowInsert) => ({
  ...row,
  configurations: row.configurations as unknown as Json,
  gallery: row.gallery as unknown as Json,
});

/** Append -2, -3 … until the slug is free (ignoring the row being edited). */
async function uniqueSlug(
  supabaseAdmin: {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          col: string,
          val: string,
        ) => { maybeSingle: () => Promise<{ data: { id: string } | null }> };
      };
    };
  },
  base: string,
  ignoreId?: string,
): Promise<string> {
  let candidate = base || "property";
  for (let i = 2; i < 200; i++) {
    const { data } = await supabaseAdmin
      .from("properties")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data || (ignoreId && data.id === ignoreId)) return candidate;
    candidate = `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}

export const createProperty = createServerFn({ method: "POST" })
  .middleware([requireOwnerAuth])
  .inputValidator((data: PropertyFormValues) => propertyFormSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildPropertyRow } = await import("./property-write.server");

    const desired = slugify(data.name);
    const finalSlug = await uniqueSlug(supabaseAdmin as never, desired);
    const row = buildPropertyRow(data, finalSlug);

    const { data: inserted, error } = await supabaseAdmin
      .from("properties")
      .insert({ ...toDbRow(row), created_by: context.adminProfile.id })
      .select("id, slug")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id, slug: inserted.slug };
  });

export const updateProperty = createServerFn({ method: "POST" })
  .middleware([requireOwnerAuth])
  .inputValidator((data: { id: string; values: PropertyFormValues }) => {
    if (!data?.id || typeof data.id !== "string") throw new Error("Missing property id");
    return { id: data.id, values: propertyFormSchema.parse(data.values) };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildPropertyRow } = await import("./property-write.server");

    const desired = slugify(data.values.name);
    const finalSlug = await uniqueSlug(supabaseAdmin as never, desired, data.id);
    const row = buildPropertyRow(data.values, finalSlug);

    const { error } = await supabaseAdmin.from("properties").update(toDbRow(row)).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { id: data.id, slug: finalSlug };
  });

export const deleteProperty = createServerFn({ method: "POST" })
  .middleware([requireOwnerAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id || typeof data.id !== "string") throw new Error("Missing property id");
    return { id: data.id };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("properties").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setPropertyPublished = createServerFn({ method: "POST" })
  .middleware([requireOwnerAuth])
  .inputValidator((data: { id: string; isPublished: boolean }) => {
    if (!data?.id || typeof data.id !== "string") throw new Error("Missing property id");
    return { id: data.id, isPublished: Boolean(data.isPublished) };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("properties")
      .update({ is_published: data.isPublished })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Owner-only: single property in editable form shape. */
export const getPropertyForEdit = createServerFn({ method: "GET" })
  .middleware([requireOwnerAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id || typeof data.id !== "string") throw new Error("Missing property id");
    return { id: data.id };
  })
  .handler(async ({ data }): Promise<PropertyFormValues & { id: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { toFormConfigs } = await import("./property-write.server");

    const { data: row, error } = await supabaseAdmin
      .from("properties")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error(error?.message ?? "Property not found");

    const gallery = (row.gallery ?? {}) as Record<string, string>;
    const isPlot = row.category === "Plots" || row.category === "Bungalow";
    // Plot areas are stored with a suffix ("12,000 Plot") — strip it back off
    // so the edit form shows the raw number the owner originally typed.
    const stripSuffix = (v: string | null, suffix: string) =>
      (v ?? "").replace(new RegExp(`\\s*${suffix}$`), "").replace(/^-$/, "");

    return {
      id: row.id,
      name: row.name ?? "",
      developer: row.developer === "-" ? "" : (row.developer ?? ""),
      category: (row.category as "Apartment" | "Bungalow" | "Plots") ?? "Apartment",
      tagline: row.tagline ?? "",
      location: row.location === "-" ? "" : (row.location ?? ""),
      state: row.state ?? "",
      city: row.city ?? "",
      status: row.status === "-" ? "" : (row.status ?? ""),
      possession: row.possession === "-" ? "" : (row.possession ?? ""),
      expertNote: row.expert_note ?? "",
      imageUrl: row.image_url ?? "",
      gallery: {
        livingRoom: gallery.livingRoom ?? "",
        pool: gallery.pool ?? "",
        clubhouse: gallery.clubhouse ?? "",
        masterBedroom: gallery.masterBedroom ?? "",
      },
      plotSuperArea: isPlot ? stripSuffix(row.super_built_up_area, "Plot") : "",
      plotCarpetArea: isPlot ? stripSuffix(row.carpet_area, "Built-up") : "",
      amenities: row.amenities ?? [],
      advantages: row.advantages ?? [],
      configs: toFormConfigs((row.configurations ?? {}) as PropertyConfigurations),
      isPublished: row.is_published ?? true,
    };
  });
