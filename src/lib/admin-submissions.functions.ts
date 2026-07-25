import { createServerFn } from "@tanstack/react-start";
import { requireOwnerAuth } from "@/integrations/supabase/admin-auth-middleware";
import type { PropertyFormValues } from "./property-schema";
import { slug as slugify } from "./slug";
import { toDbRow, uniqueSlug } from "./property-crud.functions";

export interface SubmissionListItem {
  id: string;
  action: "create" | "update";
  status: "pending" | "approved" | "rejected";
  propertyId: string | null;
  propertyName: string;
  developerId: string;
  developerName: string;
  developerEmail: string;
  createdAt: string;
  reviewedAt: string | null;
  reviewerNote: string | null;
}

/** Owner-only: every submission, newest first, pending ones easy to isolate
 *  client-side by `status`. */
export const listSubmissions = createServerFn({ method: "GET" })
  .middleware([requireOwnerAuth])
  .handler(async (): Promise<SubmissionListItem[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: subs, error } = await supabaseAdmin
      .from("property_submissions")
      .select(
        "id, action, status, property_id, developer_id, payload, reviewer_note, created_at, reviewed_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const developerIds = Array.from(new Set((subs ?? []).map((s) => s.developer_id)));
    const { data: developers } = developerIds.length
      ? await supabaseAdmin
          .from("admin_profiles")
          .select("id, email, full_name")
          .in("id", developerIds)
      : { data: [] };
    const byId = new Map((developers ?? []).map((d) => [d.id, d]));

    return (subs ?? []).map((s) => {
      const dev = byId.get(s.developer_id);
      return {
        id: s.id,
        action: s.action,
        status: s.status,
        propertyId: s.property_id,
        propertyName: (s.payload as { name?: string })?.name ?? "Untitled property",
        developerId: s.developer_id,
        developerName: dev?.full_name ?? dev?.email ?? "Unknown developer",
        developerEmail: dev?.email ?? "",
        createdAt: s.created_at,
        reviewedAt: s.reviewed_at,
        reviewerNote: s.reviewer_note,
      };
    });
  });

/** Owner-only: one submission's full payload, for the review screen. */
export const getSubmission = createServerFn({ method: "GET" })
  .middleware([requireOwnerAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Missing submission id");
    return { id: data.id };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub, error } = await supabaseAdmin
      .from("property_submissions")
      .select("id, action, status, property_id, developer_id, payload, reviewer_note, created_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !sub) throw new Error(error?.message ?? "Submission not found");
    return {
      id: sub.id,
      action: sub.action as "create" | "update",
      status: sub.status as "pending" | "approved" | "rejected",
      propertyId: sub.property_id,
      developerId: sub.developer_id,
      payload: sub.payload as PropertyFormValues,
      reviewerNote: sub.reviewer_note,
      createdAt: sub.created_at,
    };
  });

/** Owner-only: approving is the ONLY path that ever writes a submission's data
 *  into `properties` — a create makes a new published property, an update
 *  applies the payload to the existing row. Either way the live site only
 *  ever reflects what's been explicitly approved here. */
export const approveSubmission = createServerFn({ method: "POST" })
  .middleware([requireOwnerAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Missing submission id");
    return { id: data.id };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildPropertyRow } = await import("./property-write.server");

    const { data: sub, error } = await supabaseAdmin
      .from("property_submissions")
      .select("id, action, property_id, developer_id, payload, status")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !sub) throw new Error(error?.message ?? "Submission not found");
    if (sub.status !== "pending") throw new Error("This submission has already been reviewed");

    const values = { ...(sub.payload as PropertyFormValues), isPublished: true };
    let propertyId = sub.property_id;

    if (sub.action === "create") {
      const desired = slugify(values.name);
      const finalSlug = await uniqueSlug(supabaseAdmin as never, desired);
      const row = buildPropertyRow(values, finalSlug);
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("properties")
        .insert({ ...toDbRow(row), created_by: sub.developer_id })
        .select("id")
        .single();
      if (insertError) throw new Error(insertError.message);
      propertyId = inserted.id;
    } else {
      if (!propertyId) throw new Error("Update submission is missing its property id");
      const desired = slugify(values.name);
      const finalSlug = await uniqueSlug(supabaseAdmin as never, desired, propertyId);
      const row = buildPropertyRow(values, finalSlug);
      const { error: updateError } = await supabaseAdmin
        .from("properties")
        .update(toDbRow(row))
        .eq("id", propertyId);
      if (updateError) throw new Error(updateError.message);
    }

    const { error: reviewError } = await supabaseAdmin
      .from("property_submissions")
      .update({
        status: "approved",
        property_id: propertyId,
        reviewer_id: context.adminProfile.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (reviewError) throw new Error(reviewError.message);

    return { ok: true, propertyId };
  });

/** Owner-only: rejects without touching `properties` at all — the developer
 *  sees the note on their dashboard and can resubmit. */
export const rejectSubmission = createServerFn({ method: "POST" })
  .middleware([requireOwnerAuth])
  .inputValidator((data: { id: string; note?: string }) => {
    if (!data?.id) throw new Error("Missing submission id");
    return { id: data.id, note: data.note?.trim() || null };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub, error } = await supabaseAdmin
      .from("property_submissions")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !sub) throw new Error(error?.message ?? "Submission not found");
    if (sub.status !== "pending") throw new Error("This submission has already been reviewed");

    const { error: updateError } = await supabaseAdmin
      .from("property_submissions")
      .update({
        status: "rejected",
        reviewer_note: data.note,
        reviewer_id: context.adminProfile.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (updateError) throw new Error(updateError.message);
    return { ok: true };
  });
