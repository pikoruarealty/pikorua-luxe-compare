import { createServerFn } from "@tanstack/react-start";
import { requireOwnerAuth } from "@/integrations/supabase/admin-auth-middleware";
import type { PropertyFormValues } from "@/lib/property-schema";
import { slug as slugify } from "@/lib/slug";
import { throwSafeError } from "@/lib/safe-error";
import { toDbRow, uniqueSlug } from "./property-crud.functions";

/** V2 submissions (see `listV2Submissions` below) are addressed by this
 *  prefix stapled onto their `property_submission_workflows.id`, so a single
 *  opaque `id: string` can flow through get/approve/reject without the
 *  frontend ever needing to know which system a submission lives in. */
const V2_ID_PREFIX = "v2:";

function v2Status(state: string): "pending" | "approved" | "rejected" {
  if (state === "in_review") return "pending";
  if (state === "published") return "approved";
  return "rejected";
}

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

/** Best-effort v2 catalogue publish, run right after the v1 write that
 *  `approveSubmission` already made. v1 stays the safety net while v2 is
 *  still being verified — a failure here is reported back to the admin, not
 *  rolled back, since the live (v1) site must keep reflecting what was just
 *  approved either way. */
async function publishV2Catalogue(
  values: PropertyFormValues,
  propertyId: string,
  developerId: string,
  reviewerId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const { getDatabase } = await import("@/db/client.server");
    const { configurationOptions, markets } = await import("@/db/schema");
    const { ilike, eq, and } = await import("drizzle-orm");
    const { buildPublicationRevision } = await import("@/domain/publication-mapping.server");
    const { saveDeveloperRevision, submitDeveloperWorkflow } =
      await import("@/repositories/submission-workflow.repository.server");
    const { publishWorkflow } = await import("@/repositories/publication.repository.server");

    const db = getDatabase();
    const [market] = await db
      .select({ id: markets.id, stateCode: markets.stateCode, cityCode: markets.cityCode })
      .from(markets)
      .where(
        and(
          eq(markets.isEnabled, true),
          ilike(markets.stateName, values.state.trim()),
          ilike(markets.cityName, values.city.trim()),
        ),
      )
      .limit(1);
    if (!market) {
      return { ok: false, reason: `No enabled market matches "${values.city}, ${values.state}"` };
    }

    const optionRows = await db
      .select({ id: configurationOptions.id, kind: configurationOptions.kind })
      .from(configurationOptions);
    const configurationOptionsByKind = new Map(optionRows.map((row) => [row.kind, row.id]));

    const revision = buildPublicationRevision(values, {
      configurationOptionsByKind,
      marketId: market.id,
      stateCode: market.stateCode,
      cityCode: market.cityCode,
    });

    const { workflowId } = await saveDeveloperRevision(
      developerId,
      revision,
      undefined,
      propertyId,
    );
    await submitDeveloperWorkflow(workflowId, developerId);
    await publishWorkflow(workflowId, reviewerId);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Unknown error" };
  }
}

/** V2 counterpart of the `property_submissions` read in `listSubmissions` —
 *  developer edits to V2-native properties land here via C3b's
 *  `submitV2PropertyUpdate`, never in V1. Only `in_review` (awaiting review),
 *  `rejected` and `published` are surfaced: `draft` never got submitted, and
 *  `submitted`/`validating`/`changes_requested` aren't reachable persisted
 *  states in this synchronous-only release (see `submitDeveloperWorkflow`).
 *  `developerName`/`developerEmail` are left blank here — `listSubmissions`
 *  resolves them together with V1's, from the same shared `admin_profiles`. */
async function listV2Submissions(): Promise<SubmissionListItem[]> {
  const { getDatabase } = await import("@/db/client.server");
  const { propertySubmissionWorkflows, propertySubmissionRevisions, reviewActions } =
    await import("@/db/schema");
  const { inArray, desc } = await import("drizzle-orm");

  const db = getDatabase();
  const workflows = await db
    .select({
      id: propertySubmissionWorkflows.id,
      propertyId: propertySubmissionWorkflows.propertyId,
      developerId: propertySubmissionWorkflows.developerId,
      state: propertySubmissionWorkflows.state,
      currentRevision: propertySubmissionWorkflows.currentRevision,
      createdAt: propertySubmissionWorkflows.createdAt,
    })
    .from(propertySubmissionWorkflows)
    .where(inArray(propertySubmissionWorkflows.state, ["in_review", "rejected", "published"]))
    .orderBy(desc(propertySubmissionWorkflows.createdAt));
  if (!workflows.length) return [];

  const workflowIds = workflows.map((w) => w.id);
  const revisions = await db
    .select({
      workflowId: propertySubmissionRevisions.workflowId,
      revision: propertySubmissionRevisions.revision,
      payload: propertySubmissionRevisions.submittedPayload,
    })
    .from(propertySubmissionRevisions)
    .where(inArray(propertySubmissionRevisions.workflowId, workflowIds));
  const currentRevisionByWorkflow = new Map(workflows.map((w) => [w.id, w.currentRevision]));
  const nameByWorkflow = new Map(
    revisions
      .filter((r) => currentRevisionByWorkflow.get(r.workflowId) === r.revision)
      .map((r) => [r.workflowId, (r.payload as { property?: { name?: string } })?.property?.name]),
  );

  const actions = await db
    .select({
      workflowId: reviewActions.workflowId,
      reason: reviewActions.reason,
      createdAt: reviewActions.createdAt,
    })
    .from(reviewActions)
    .where(inArray(reviewActions.workflowId, workflowIds))
    .orderBy(desc(reviewActions.createdAt));
  const latestActionByWorkflow = new Map<string, { reason: string | null; createdAt: Date }>();
  for (const a of actions) {
    if (!latestActionByWorkflow.has(a.workflowId)) {
      latestActionByWorkflow.set(a.workflowId, { reason: a.reason, createdAt: a.createdAt });
    }
  }

  return workflows.map((w) => {
    const action = w.state === "in_review" ? undefined : latestActionByWorkflow.get(w.id);
    return {
      id: `${V2_ID_PREFIX}${w.id}`,
      action: "update",
      status: v2Status(w.state),
      propertyId: w.propertyId,
      propertyName: nameByWorkflow.get(w.id) ?? "Untitled property",
      developerId: w.developerId,
      developerName: "",
      developerEmail: "",
      createdAt: w.createdAt.toISOString(),
      reviewedAt: action?.createdAt.toISOString() ?? null,
      reviewerNote: action?.reason ?? null,
    };
  });
}

/** V2 counterpart of `getSubmission`. Loads the workflow's current revision
 *  and runs it through C3a's reverse mapper so the review dialog's existing
 *  `PayloadPreview` (built for V1's flat `PropertyFormValues`) needs no
 *  changes to render a V2 submission. */
async function getV2Submission(workflowId: string) {
  const { getDatabase } = await import("@/db/client.server");
  const { propertySubmissionWorkflows, propertySubmissionRevisions, markets, reviewActions } =
    await import("@/db/schema");
  const { eq, and, desc } = await import("drizzle-orm");
  const { publicationRevisionSchema } = await import("@/domain/publication");
  const { buildFormValuesFromRevision } = await import("@/domain/publication-to-form.server");

  const db = getDatabase();
  const [workflow] = await db
    .select()
    .from(propertySubmissionWorkflows)
    .where(eq(propertySubmissionWorkflows.id, workflowId))
    .limit(1);
  if (!workflow) return null;

  const [revisionRow] = await db
    .select({ payload: propertySubmissionRevisions.submittedPayload })
    .from(propertySubmissionRevisions)
    .where(
      and(
        eq(propertySubmissionRevisions.workflowId, workflowId),
        eq(propertySubmissionRevisions.revision, workflow.currentRevision),
      ),
    )
    .limit(1);
  if (!revisionRow) return null;

  const revision = publicationRevisionSchema.parse(revisionRow.payload);
  const [market] = await db
    .select({ stateName: markets.stateName, cityName: markets.cityName })
    .from(markets)
    .where(eq(markets.id, revision.marketId))
    .limit(1);
  const payload = buildFormValuesFromRevision(revision, {
    stateName: market?.stateName,
    cityName: market?.cityName,
  });

  const [latestAction] =
    workflow.state === "in_review"
      ? []
      : await db
          .select({ reason: reviewActions.reason })
          .from(reviewActions)
          .where(eq(reviewActions.workflowId, workflowId))
          .orderBy(desc(reviewActions.createdAt))
          .limit(1);

  return {
    id: `${V2_ID_PREFIX}${workflow.id}`,
    action: "update" as const,
    status: v2Status(workflow.state),
    propertyId: workflow.propertyId,
    developerId: workflow.developerId,
    payload,
    reviewerNote: latestAction?.reason ?? null,
    createdAt: workflow.createdAt.toISOString(),
  };
}

/** Owner-only: every submission, newest first, pending ones easy to isolate
 *  client-side by `status`. Merges V1's `property_submissions` (creates, and
 *  updates for properties not yet on V2) with V2's
 *  `property_submission_workflows` (updates for V2-native properties, C3b) —
 *  see `listV2Submissions`. The `id` stays an opaque string to the frontend;
 *  a `v2:` prefix is how get/approve/reject tell the two systems apart. */
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
    if (error) throwSafeError("listSubmissions", error, "Could not load submissions");

    const v2Items = await listV2Submissions();

    const developerIds = Array.from(
      new Set([...(subs ?? []).map((s) => s.developer_id), ...v2Items.map((v) => v.developerId)]),
    );
    const { data: developers } = developerIds.length
      ? await supabaseAdmin
          .from("admin_profiles")
          .select("id, email, full_name")
          .in("id", developerIds)
      : { data: [] };
    const byId = new Map((developers ?? []).map((d) => [d.id, d]));

    const v1Items: SubmissionListItem[] = (subs ?? []).map((s) => {
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

    const v2Resolved: SubmissionListItem[] = v2Items.map((item) => {
      const dev = byId.get(item.developerId);
      return {
        ...item,
        developerName: dev?.full_name ?? dev?.email ?? "Unknown developer",
        developerEmail: dev?.email ?? "",
      };
    });

    return [...v1Items, ...v2Resolved].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  });

/** Owner-only: one submission's full payload, for the review screen. */
export const getSubmission = createServerFn({ method: "GET" })
  .middleware([requireOwnerAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Missing submission id");
    return { id: data.id };
  })
  .handler(async ({ data }) => {
    if (data.id.startsWith(V2_ID_PREFIX)) {
      const submission = await getV2Submission(data.id.slice(V2_ID_PREFIX.length));
      if (!submission) throw new Error("Submission not found");
      return submission;
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub, error } = await supabaseAdmin
      .from("property_submissions")
      .select("id, action, status, property_id, developer_id, payload, reviewer_note, created_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throwSafeError("getSubmission", error, "Could not load submission");
    if (!sub) throw new Error("Submission not found");
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
 *  ever reflects what's been explicitly approved here.
 *
 *  For a `v2:`-prefixed id, this calls `publishWorkflow` directly instead —
 *  V2 revisions are already validated and immutable, so there is nothing
 *  left to build a row from; publishing IS the approval. */
export const approveSubmission = createServerFn({ method: "POST" })
  .middleware([requireOwnerAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Missing submission id");
    return { id: data.id };
  })
  .handler(async ({ data, context }) => {
    if (data.id.startsWith(V2_ID_PREFIX)) {
      const { publishWorkflow } = await import("@/repositories/publication.repository.server");
      const result = await publishWorkflow(
        data.id.slice(V2_ID_PREFIX.length),
        context.adminProfile.id,
      );
      return { ok: true, propertyId: result.propertyId, v2Published: true, v2Error: null };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { addPropertyCoordinates, buildPropertyRow } =
      await import("@/server/property-write.server");

    const { data: sub, error } = await supabaseAdmin
      .from("property_submissions")
      .select("id, action, property_id, developer_id, payload, status")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throwSafeError("approveSubmission.load", error, "Could not load submission");
    if (!sub) throw new Error("Submission not found");
    if (sub.status !== "pending") throw new Error("This submission has already been reviewed");

    const values = { ...(sub.payload as PropertyFormValues), isPublished: true };
    let propertyId = sub.property_id;

    if (sub.action === "create") {
      const desired = slugify(values.name);
      const finalSlug = await uniqueSlug(supabaseAdmin as never, desired);
      const row = await addPropertyCoordinates(buildPropertyRow(values, finalSlug), values);
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("properties")
        // Coordinates are added by the pending migration, ahead of regenerated DB types.
        .insert({ ...toDbRow(row), created_by: sub.developer_id } as never)
        .select("id")
        .single();
      if (insertError) {
        throwSafeError("approveSubmission.create", insertError, "Could not approve submission");
      }
      propertyId = inserted.id;
    } else {
      if (!propertyId) throw new Error("Update submission is missing its property id");
      const desired = slugify(values.name);
      const finalSlug = await uniqueSlug(supabaseAdmin as never, desired, propertyId);
      const row = await addPropertyCoordinates(buildPropertyRow(values, finalSlug), values);
      const { error: updateError } = await supabaseAdmin
        .from("properties")
        .update(toDbRow(row) as never)
        .eq("id", propertyId);
      if (updateError) {
        throwSafeError("approveSubmission.update", updateError, "Could not approve submission");
      }
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
    if (reviewError) {
      throwSafeError("approveSubmission.review", reviewError, "Could not approve submission");
    }

    const v2 = await publishV2Catalogue(
      values,
      propertyId,
      sub.developer_id,
      context.adminProfile.id,
    );
    return {
      ok: true,
      propertyId,
      v2Published: v2.ok,
      v2Error: v2.ok ? null : v2.reason,
    };
  });

/** Owner-only: rejects without touching `properties` at all — the developer
 *  sees the note on their dashboard and can resubmit.
 *
 *  For a `v2:`-prefixed id, this drives the workflow's own state machine
 *  (`adjudicateWorkflow`) instead of a status column — the pre-check below
 *  exists only to surface the same "already reviewed" message V1 gives,
 *  rather than the state machine's more technical transition error. */
export const rejectSubmission = createServerFn({ method: "POST" })
  .middleware([requireOwnerAuth])
  .inputValidator((data: { id: string; note?: string }) => {
    if (!data?.id) throw new Error("Missing submission id");
    return { id: data.id, note: data.note?.trim() || null };
  })
  .handler(async ({ data, context }) => {
    if (data.id.startsWith(V2_ID_PREFIX)) {
      const workflowId = data.id.slice(V2_ID_PREFIX.length);
      const { getDatabase } = await import("@/db/client.server");
      const { propertySubmissionWorkflows } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      const { adjudicateWorkflow } =
        await import("@/repositories/submission-workflow.repository.server");

      const db = getDatabase();
      const [workflow] = await db
        .select({ state: propertySubmissionWorkflows.state })
        .from(propertySubmissionWorkflows)
        .where(eq(propertySubmissionWorkflows.id, workflowId))
        .limit(1);
      if (!workflow) throw new Error("Submission not found");
      if (workflow.state !== "in_review") {
        throw new Error("This submission has already been reviewed");
      }

      await adjudicateWorkflow(workflowId, context.adminProfile.id, "rejected", data.note ?? "");
      return { ok: true };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub, error } = await supabaseAdmin
      .from("property_submissions")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throwSafeError("rejectSubmission.load", error, "Could not load submission");
    if (!sub) throw new Error("Submission not found");
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
    if (updateError) {
      throwSafeError("rejectSubmission", updateError, "Could not reject submission");
    }
    return { ok: true };
  });
