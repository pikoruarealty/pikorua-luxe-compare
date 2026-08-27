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
  // V1 submissions can be fixed and resubmitted in place (see
  // getMyPendingSubmission/updateMyPendingSubmission). V2 has no such concept —
  // each attempt is its own immutable workflow — so a rejected V2 submission
  // is resolved by just resubmitting the property itself, not by editing this row.
  editable: boolean;
}

/** V1 properties own their own name/developer/location columns. V2 (the local
 *  Postgres catalogue populated by scripts/load-brochures.ts) has no such
 *  columns — everything lives inside the current publication version's
 *  jsonb snapshot, same as the public detail page reads it (see
 *  public-detail.repository.server.ts). The inner join on
 *  currentPublicationVersionId means only published V2 properties can ever
 *  appear here, so isPublished is always true. hasPendingUpdate reflects a
 *  real outstanding submission workflow — see the non-terminal states below. */
async function getMyV2Properties(developerId: string): Promise<DeveloperProperty[]> {
  const { eq, and, inArray } = await import("drizzle-orm");
  const { getDatabase } = await import("@/db/client.server");
  const { properties, propertyPublicationVersions, markets, propertySubmissionWorkflows } =
    await import("@/db/schema");
  const db = getDatabase();
  const rows = await db
    .select({
      id: properties.id,
      snapshot: propertyPublicationVersions.publicSnapshot,
      cityName: markets.cityName,
    })
    .from(properties)
    .innerJoin(
      propertyPublicationVersions,
      eq(properties.currentPublicationVersionId, propertyPublicationVersions.id),
    )
    .innerJoin(markets, eq(propertyPublicationVersions.marketId, markets.id))
    .where(eq(properties.createdBy, developerId));

  const propertyIds = rows.map((row) => row.id);
  // "Outstanding" = submitted for review and not yet resolved. `draft` is
  // excluded (nothing submitted yet); `rejected`/`published`/`superseded` are
  // excluded (closed — either dead or already live).
  const pendingRows = propertyIds.length
    ? await db
        .select({ propertyId: propertySubmissionWorkflows.propertyId })
        .from(propertySubmissionWorkflows)
        .where(
          and(
            inArray(propertySubmissionWorkflows.propertyId, propertyIds),
            inArray(propertySubmissionWorkflows.state, [
              "submitted",
              "validating",
              "in_review",
              "changes_requested",
            ]),
          ),
        )
    : [];
  const pendingIds = new Set(pendingRows.map((row) => row.propertyId));

  const text = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : null;
  return rows.map((row) => {
    const snapshot = row.snapshot as Record<string, unknown>;
    return {
      id: row.id,
      name: text(snapshot.name) ?? "Untitled property",
      developer: text(snapshot.developerName) ?? "-",
      location: text(snapshot.addressLine) ?? text(snapshot.cityName) ?? row.cityName ?? "-",
      isPublished: true,
      hasPendingUpdate: pendingIds.has(row.id),
    };
  });
}

function v2SubmissionStatus(state: string): "pending" | "approved" | "rejected" {
  if (state === "in_review") return "pending";
  if (state === "published") return "approved";
  return "rejected";
}

/** V2 counterpart of the `property_submissions` read below — every create or
 *  update this developer has ever submitted through the V2 workflow queue
 *  (submitV2PropertyCreate / submitV2PropertyUpdate). Unlike V1, a rejected V2
 *  submission has no "reopen in place" path: each attempt is its own immutable
 *  workflow, so fixing one just means resubmitting the property (see the
 *  `editable: false` note on DeveloperSubmission). */
async function getMyV2Submissions(developerId: string): Promise<DeveloperSubmission[]> {
  const { eq, and, inArray, desc } = await import("drizzle-orm");
  const { getDatabase } = await import("@/db/client.server");
  const { propertySubmissionWorkflows, propertySubmissionRevisions, reviewActions } =
    await import("@/db/schema");

  const db = getDatabase();
  const workflows = await db
    .select({
      id: propertySubmissionWorkflows.id,
      propertyId: propertySubmissionWorkflows.propertyId,
      state: propertySubmissionWorkflows.state,
      currentRevision: propertySubmissionWorkflows.currentRevision,
      createdAt: propertySubmissionWorkflows.createdAt,
    })
    .from(propertySubmissionWorkflows)
    .where(
      and(
        eq(propertySubmissionWorkflows.developerId, developerId),
        inArray(propertySubmissionWorkflows.state, ["in_review", "rejected", "published"]),
      ),
    )
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
      id: w.id,
      action: (w.propertyId ? "update" : "create") as "create" | "update",
      status: v2SubmissionStatus(w.state),
      propertyId: w.propertyId,
      propertyName: nameByWorkflow.get(w.id) ?? "Untitled property",
      reviewerNote: action?.reason ?? null,
      createdAt: w.createdAt.toISOString(),
      reviewedAt: action?.createdAt.toISOString() ?? null,
      editable: false,
    };
  });
}

/** Developer-only: their live properties plus their full submission history —
 *  the dashboard renders both (live ones are editable, submissions show what's
 *  pending/rejected/approved). Properties come from two systems (V1: hosted
 *  Supabase, V2: local Postgres catalogue) that don't otherwise talk to each
 *  other — see getMyV2Properties. The V1 `properties` read was dropped here:
 *  every row in that table has a null created_by (no V1 property has ever been
 *  developer-owned), so it always returned empty. Submissions merge V1's
 *  `property_submissions` with V2's workflow queue — see getMyV2Submissions. */
export const getMyDeveloperDashboard = createServerFn({ method: "GET" })
  .middleware([requireAdminAuth])
  .handler(
    async ({
      context,
    }): Promise<{ properties: DeveloperProperty[]; submissions: DeveloperSubmission[] }> => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const developerId = context.adminProfile.id;

      const [{ data: subs, error: subsError }, v2Props, v2Subs] = await Promise.all([
        supabaseAdmin
          .from("property_submissions")
          .select(
            "id, action, status, property_id, payload, reviewer_note, created_at, reviewed_at",
          )
          .eq("developer_id", developerId)
          .order("created_at", { ascending: false }),
        getMyV2Properties(developerId),
        getMyV2Submissions(developerId),
      ]);
      if (subsError)
        throwSafeError("getDeveloperSubmissions", subsError, "Could not load submissions");

      const v1Submissions: DeveloperSubmission[] = (subs ?? []).map((s) => ({
        id: s.id,
        action: s.action,
        status: s.status,
        propertyId: s.property_id,
        propertyName: (s.payload as { name?: string })?.name ?? "Untitled property",
        reviewerNote: s.reviewer_note,
        createdAt: s.created_at,
        reviewedAt: s.reviewed_at,
        editable: true,
      }));

      return {
        properties: v2Props,
        submissions: [...v1Submissions, ...v2Subs].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      };
    },
  );

/** Developer-only: load one of THEIR OWN V2-published properties into the edit
 *  form shape. V2 has no flat row to read — the current content lives in the
 *  jsonb snapshot's *source revision* (a `PublicationRevision`, immutable),
 *  which `buildFormValuesFromRevision` (C3a's reverse mapper) turns back into
 *  the same form shape the V1 branch above returns. This always reflects the
 *  last *published* state, matching V1's `getMyPropertyForEdit`, which also
 *  reads the live row rather than a pending submission's draft. */
async function getMyV2PropertyForEdit(
  propertyId: string,
  developerId: string,
): Promise<(PropertyFormValues & { id: string }) | null> {
  const { eq, and } = await import("drizzle-orm");
  const { getDatabase } = await import("@/db/client.server");
  const { properties, propertyPublicationVersions, propertySubmissionRevisions, markets } =
    await import("@/db/schema");
  const { publicationRevisionSchema } = await import("@/domain/publication");
  const { buildFormValuesFromRevision } = await import("@/domain/publication-to-form.server");

  const db = getDatabase();
  const [row] = await db
    .select({
      sourceRevisionId: propertyPublicationVersions.sourceRevisionId,
      stateName: markets.stateName,
      cityName: markets.cityName,
    })
    .from(properties)
    .innerJoin(
      propertyPublicationVersions,
      eq(properties.currentPublicationVersionId, propertyPublicationVersions.id),
    )
    .innerJoin(markets, eq(propertyPublicationVersions.marketId, markets.id))
    .where(and(eq(properties.id, propertyId), eq(properties.createdBy, developerId)))
    .limit(1);
  if (!row?.sourceRevisionId) return null;

  const [revisionRow] = await db
    .select({ payload: propertySubmissionRevisions.submittedPayload })
    .from(propertySubmissionRevisions)
    .where(eq(propertySubmissionRevisions.id, row.sourceRevisionId))
    .limit(1);
  if (!revisionRow) return null;

  const revision = publicationRevisionSchema.parse(revisionRow.payload);
  const values = buildFormValuesFromRevision(revision, {
    stateName: row.stateName,
    cityName: row.cityName,
  });
  return { ...values, id: propertyId };
}

/** Developer-only: load one of THEIR OWN live properties into the edit form
 *  shape. V1 had its own branch here (a flat row read, ownership-checked
 *  against created_by) but every V1 property has a null created_by — no V1
 *  property has ever been developer-owned — so that branch never matched
 *  anything and was removed. Always V2 now — see getMyV2PropertyForEdit. */
export const getMyPropertyForEdit = createServerFn({ method: "GET" })
  .middleware([requireAdminAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Missing property id");
    return { id: data.id };
  })
  .handler(async ({ data, context }): Promise<PropertyFormValues & { id: string }> => {
    const v2 = await getMyV2PropertyForEdit(data.id, context.adminProfile.id);
    if (!v2) throw new Error("Property not found");
    return v2;
  });

/** Developer-only: reopen one of their own pending OR rejected submissions so
 *  it can be corrected. Approved ones are history and stay read-only — an
 *  approved submission's changes already live on the property itself. */
export const getMyPendingSubmission = createServerFn({ method: "GET" })
  .middleware([requireAdminAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Missing submission id");
    return { id: data.id };
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<{ values: PropertyFormValues; status: "pending" | "rejected" }> => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: row, error } = await supabaseAdmin
        .from("property_submissions")
        .select("payload, status")
        .eq("id", data.id)
        .eq("developer_id", context.adminProfile.id)
        .maybeSingle();
      if (error || !row) throw new Error("Submission not found");
      if (row.status !== "pending" && row.status !== "rejected") {
        throw new Error("Only a pending or rejected submission can be edited.");
      }
      return { values: propertyFormSchema.parse(row.payload), status: row.status };
    },
  );

/** Developer-only: replace the payload of a pending submission in place, so
 *  correcting a mistake doesn't leave the owner with two near-identical
 *  requests to review. Also handles resubmitting a rejected one — flips it
 *  back to "pending" and clears the prior reviewer's verdict, so it re-enters
 *  the same queue rather than needing a brand new submission row. */
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
      .update({
        payload: data.values as never,
        status: "pending",
        reviewer_note: null,
        reviewer_id: null,
        reviewed_at: null,
      })
      .eq("id", data.id)
      .eq("developer_id", context.adminProfile.id)
      .in("status", ["pending", "rejected"])
      .select("id")
      .maybeSingle();
    if (error) throwSafeError("submitProperty", error, "Could not submit property");
    if (!updated) throw new Error("That submission is no longer editable — it has been reviewed.");
    return { ok: true };
  });

/** Developer-only: submits a V2 property's edit straight into the V2 review
 *  queue (saveDeveloperRevision -> submitDeveloperWorkflow), mirroring what
 *  publishV2Catalogue does after a V1 approval, minus the final publish —
 *  publishing a developer's own submission without review is exactly the gap
 *  Phase C4 closes. Ownership is re-checked here rather than trusted from the
 *  caller, since this runs independently of the V1 lookup that decided to
 *  fall back here. */
async function submitV2PropertyUpdate(
  propertyId: string,
  developerId: string,
  values: PropertyFormValues,
): Promise<{ ok: true }> {
  const { eq, and, ilike } = await import("drizzle-orm");
  const { getDatabase } = await import("@/db/client.server");
  const { properties, configurationOptions, markets } = await import("@/db/schema");
  const { buildPublicationRevision } = await import("@/domain/publication-mapping.server");
  const { saveDeveloperRevision, submitDeveloperWorkflow } =
    await import("@/repositories/submission-workflow.repository.server");

  const db = getDatabase();
  const [owned] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.createdBy, developerId)))
    .limit(1);
  if (!owned) throw new Error("You can only submit updates for your own properties");

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
    throw new Error(`No enabled market matches "${values.city}, ${values.state}"`);
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

  const { workflowId } = await saveDeveloperRevision(developerId, revision, undefined, propertyId);
  await submitDeveloperWorkflow(workflowId, developerId);
  return { ok: true };
}

/** Developer-only: submits a brand-new property straight into the V2 review
 *  queue (saveDeveloperRevision -> submitDeveloperWorkflow), with no existing
 *  property to attach the revision to — publishWorkflow creates the identity
 *  itself once an owner approves. Mirrors submitV2PropertyUpdate minus the
 *  ownership check, since there's nothing to own yet. */
async function submitV2PropertyCreate(
  developerId: string,
  values: PropertyFormValues,
): Promise<{ ok: true }> {
  const { eq, and, ilike } = await import("drizzle-orm");
  const { getDatabase } = await import("@/db/client.server");
  const { configurationOptions, markets } = await import("@/db/schema");
  const { buildPublicationRevision } = await import("@/domain/publication-mapping.server");
  const { saveDeveloperRevision, submitDeveloperWorkflow } =
    await import("@/repositories/submission-workflow.repository.server");

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
    throw new Error(`No enabled market matches "${values.city}, ${values.state}"`);
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

  const { workflowId } = await saveDeveloperRevision(developerId, revision, undefined, undefined);
  await submitDeveloperWorkflow(workflowId, developerId);
  return { ok: true };
}

/** Developer-only: creates a pending review request. Never writes to
 *  `properties` directly — an owner approval is what actually publishes a new
 *  property or applies an edit to a live one (see admin-submissions.functions.ts).
 *  A "create" always goes into the V2 workflow queue (see
 *  submitV2PropertyCreate) — there's no V1 create path anymore. An "update"
 *  whose id isn't a V1 property falls back to the V2 queue too (see
 *  submitV2PropertyUpdate); an update to a still-V1 property stays V1. */
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
    if (data.action === "create") {
      return submitV2PropertyCreate(context.adminProfile.id, data.values);
    }

    const propertyId = data.propertyId as string; // guaranteed by the validator above
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: owned, error } = await supabaseAdmin
      .from("properties")
      .select("id")
      .eq("id", propertyId)
      .eq("created_by", context.adminProfile.id)
      .maybeSingle();
    if (error) throw new Error("You can only submit updates for your own properties");
    if (!owned) {
      return submitV2PropertyUpdate(propertyId, context.adminProfile.id, data.values);
    }

    const { error: insertError } = await supabaseAdmin.from("property_submissions").insert({
      developer_id: context.adminProfile.id,
      property_id: propertyId,
      action: "update",
      payload: data.values as never,
      status: "pending",
    });
    if (insertError)
      throwSafeError("updatePendingSubmission", insertError, "Could not update submission");
    return { ok: true };
  });
