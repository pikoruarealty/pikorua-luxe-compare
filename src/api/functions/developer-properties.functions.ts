import { createServerFn } from "@tanstack/react-start";
import { throwSafeError } from "@/lib/safe-error";
import { requireAdminAuth } from "@/integrations/supabase/admin-auth-middleware";
import {
  parsePropertySubmission,
  propertyFormSchema,
  type PropertyFormValues,
} from "@/lib/property-schema";

export interface DeveloperProperty {
  id: string; // properties.id
  name: string;
  developer: string;
  location: string;
  isPublished: boolean;
  hasPendingUpdate: boolean;
}

export interface DeveloperSubmission {
  id: string;
  action: "create" | "update";
  status: "pending" | "approved" | "rejected";
  propertyId: string | null;
  propertyName: string; // from the submitted payload, so it shows even before approval
  reviewerNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

/** Developer-only: their live properties plus their full submission history —
 *  the dashboard renders both (live ones are editable, submissions show what's
 *  pending/rejected/approved). */
export const getMyDeveloperDashboard = createServerFn({ method: "GET" })
  .middleware([requireAdminAuth])
  .handler(
    async ({
      context,
    }): Promise<{ properties: DeveloperProperty[]; submissions: DeveloperSubmission[] }> => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const developerId = context.adminProfile.id;

      const [{ data: props, error: propsError }, { data: subs, error: subsError }] =
        await Promise.all([
          supabaseAdmin
            .from("properties")
            .select("id, name, developer, location, is_published")
            .eq("created_by", developerId)
            .order("created_at", { ascending: false }),
          supabaseAdmin
            .from("property_submissions")
            .select(
              "id, action, status, property_id, payload, reviewer_note, created_at, reviewed_at",
            )
            .eq("developer_id", developerId)
            .order("created_at", { ascending: false }),
        ]);
      if (propsError)
        throwSafeError("getDeveloperProperties", propsError, "Could not load properties");
      if (subsError)
        throwSafeError("getDeveloperSubmissions", subsError, "Could not load submissions");

      const pendingUpdateIds = new Set(
        (subs ?? [])
          .filter((s) => s.status === "pending" && s.action === "update" && s.property_id)
          .map((s) => s.property_id as string),
      );

      return {
        properties: (props ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          developer: p.developer ?? "-",
          location: p.location ?? "-",
          isPublished: p.is_published,
          hasPendingUpdate: pendingUpdateIds.has(p.id),
        })),
        submissions: (subs ?? []).map((s) => ({
          id: s.id,
          action: s.action,
          status: s.status,
          propertyId: s.property_id,
          propertyName: (s.payload as { name?: string })?.name ?? "Untitled property",
          reviewerNote: s.reviewer_note,
          createdAt: s.created_at,
          reviewedAt: s.reviewed_at,
        })),
      };
    },
  );

/** Developer-only: load one of THEIR OWN live properties into the edit form
 *  shape — same mapping as the owner's getPropertyForEdit, but ownership-
 *  checked against created_by instead of gated on the owner role. */
export const getMyPropertyForEdit = createServerFn({ method: "GET" })
  .middleware([requireAdminAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Missing property id");
    return { id: data.id };
  })
  .handler(async ({ data, context }): Promise<PropertyFormValues & { id: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { toFormConfigs } = await import("@/server/property-write.server");

    const { data: row, error } = await supabaseAdmin
      .from("properties")
      .select("*")
      .eq("id", data.id)
      .eq("created_by", context.adminProfile.id)
      .maybeSingle();
    if (error) throwSafeError("getDeveloperProperty", error, "Could not load property");
    if (!row) throw new Error("Property not found");

    const gallery = (row.gallery ?? {}) as Record<string, string>;
    const isPlot = row.category === "Plots" || row.category === "Bungalow";
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
      possessionAsOf: row.possession_as_of ?? "",
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
      ceilingHeightBasis: "not_stated",
      clubhouseSize: row.clubhouse_size ?? "",
      possessionConfirmedAsOf: "",
      amenitiesOther: "",
      developerBackground: row.developer_background ?? "",
      developerExperienceYears: row.developer_experience_years?.toString() ?? "",
      totalDeliveredProjects: row.total_delivered_projects?.toString() ?? "",
      ongoingProjects: row.ongoing_projects?.toString() ?? "",
      notableDeliveredProjects: row.notable_delivered_projects ?? [],
      configs: toFormConfigs((row.configurations ?? {}) as never),
      isPublished: row.is_published ?? true,
    };
  });

/** Developer-only: reopen one of their own still-pending submissions so it can
 *  be corrected. Approved and rejected ones are history and stay read-only —
 *  an approved submission's changes already live on the property itself. */
export const getMyPendingSubmission = createServerFn({ method: "GET" })
  .middleware([requireAdminAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Missing submission id");
    return { id: data.id };
  })
  .handler(async ({ data, context }): Promise<PropertyFormValues> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("property_submissions")
      .select("payload, status")
      .eq("id", data.id)
      .eq("developer_id", context.adminProfile.id)
      .maybeSingle();
    if (error || !row) throw new Error("Submission not found");
    if (row.status !== "pending") {
      throw new Error("Only submissions still awaiting review can be edited.");
    }
    return propertyFormSchema.parse(row.payload);
  });

/** Developer-only: replace the payload of a pending submission in place, so
 *  correcting a mistake doesn't leave the owner with two near-identical
 *  requests to review. */
export const updateMyPendingSubmission = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((data: { id: string; values: PropertyFormValues }) => {
    if (!data?.id) throw new Error("Missing submission id");
    return { id: data.id, values: parsePropertySubmission(data.values) };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error } = await supabaseAdmin
      .from("property_submissions")
      .update({ payload: data.values as never })
      .eq("id", data.id)
      .eq("developer_id", context.adminProfile.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (error) throwSafeError("submitProperty", error, "Could not submit property");
    if (!updated) throw new Error("That submission is no longer editable — it has been reviewed.");
    return { ok: true };
  });

/** Developer-only: creates a pending review request. Never writes to
 *  `properties` directly — an owner approval is what actually publishes a new
 *  property or applies an edit to a live one (see admin-submissions.functions.ts). */
export const submitPropertyForReview = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator(
    (data: { action: "create" | "update"; propertyId?: string; values: PropertyFormValues }) => {
      if (data?.action !== "create" && data?.action !== "update") {
        throw new Error("Invalid action");
      }
      if (data.action === "update" && !data.propertyId) {
        throw new Error("Missing property id for an update submission");
      }
      return {
        action: data.action,
        propertyId: data.propertyId,
        values: parsePropertySubmission(data.values),
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.action === "update") {
      const propertyId = data.propertyId as string; // guaranteed by the validator above
      const { data: owned, error } = await supabaseAdmin
        .from("properties")
        .select("id")
        .eq("id", propertyId)
        .eq("created_by", context.adminProfile.id)
        .maybeSingle();
      if (error || !owned) throw new Error("You can only submit updates for your own properties");
    }

    const { error: insertError } = await supabaseAdmin.from("property_submissions").insert({
      developer_id: context.adminProfile.id,
      property_id: data.action === "update" ? data.propertyId : null,
      action: data.action,
      payload: data.values as never,
      status: "pending",
    });
    if (insertError)
      throwSafeError("updatePendingSubmission", insertError, "Could not update submission");
    return { ok: true };
  });
