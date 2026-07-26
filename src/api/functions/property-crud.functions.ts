import { createServerFn } from "@tanstack/react-start";
import { requireOwnerAuth } from "@/integrations/supabase/admin-auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import type { PropertyConfigurations } from "@/types/property";
import { propertyFormSchema, type PropertyFormValues } from "@/lib/property-schema";
import { slug as slugify } from "@/lib/slug";
import type { PropertyRowInsert } from "@/server/property-write.server";

/** JSONB columns are typed as Json; our richer shapes serialise cleanly into them.
 *  Exported for admin-submissions.functions.ts, which applies an approved
 *  submission's payload the same way this file writes a direct admin edit. */
export const toDbRow = (row: PropertyRowInsert) => ({
  ...row,
  configurations: row.configurations as unknown as Json,
  gallery: row.gallery as unknown as Json,
});

/** Append -2, -3 … until the slug is free (ignoring the row being edited). */
export async function uniqueSlug(
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
    const { buildPropertyRow } = await import("@/server/property-write.server");

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
    const { buildPropertyRow } = await import("@/server/property-write.server");

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
    const { toFormConfigs } = await import("@/server/property-write.server");

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
      possessionAsOf: row.possession_as_of ?? "",
      plotSize: row.plot_size ?? "",
      totalTowers: row.total_towers?.toString() ?? "",
      totalFloors: row.total_floors?.toString() ?? "",
      unitsPerFloor: row.units_per_floor?.toString() ?? "",
      totalUnits: row.total_units?.toString() ?? "",
      availableBhkTypes: row.available_bhk_types ?? "",
      reraId: row.rera_id ?? "",
      reraUrl: row.rera_url ?? "",
      proposedStartDateRera: row.proposed_start_date_rera ?? "",
      parkingLevels: row.parking_levels?.toString() ?? "",
      podiumStructure: row.podium_structure ?? "",
      liftsPerTower: row.lifts_per_tower?.toString() ?? "",
      openSpace: row.open_space ?? "",
      geyserHeatPumpProvided: row.geyser_heat_pump_provided ?? "",
      vrvAcProvided: row.vrv_ac_provided ?? "",
      windowGlazing: row.window_glazing ?? "",
      bathSanitaryFittings: row.bath_sanitary_fittings ?? "",
      flooringType: row.flooring_type ?? "",
      unitsPerAcre: row.units_per_acre ?? "",
      constructionQuality: row.construction_quality ?? "",
      internalCeilingHeight: row.internal_ceiling_height ?? "",
      clubhouseSize: row.clubhouse_size ?? "",
      developerBackground: row.developer_background ?? "",
      developerExperienceYears: row.developer_experience_years?.toString() ?? "",
      totalDeliveredProjects: row.total_delivered_projects?.toString() ?? "",
      ongoingProjects: row.ongoing_projects?.toString() ?? "",
      notableDeliveredProjects: row.notable_delivered_projects ?? [],
      configs: toFormConfigs((row.configurations ?? {}) as PropertyConfigurations),
      isPublished: row.is_published ?? true,
    };
  });
