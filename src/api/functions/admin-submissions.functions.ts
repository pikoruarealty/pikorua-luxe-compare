import { createServerFn } from "@tanstack/react-start";
import { requireOwnerAuth } from "@/integrations/supabase/admin-auth-middleware";

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

/** Every submission is a `property_submission_workflows` row — creates (no
 *  `propertyId`) and edits (existing `propertyId`) both land here, via
 *  `submitV2PropertyCreate`/`submitV2PropertyUpdate`
 *  (`developer-properties.functions.ts`). `developerName`/`developerEmail`
 *  are resolved afterwards against `admin_profiles` in `listSubmissions`. */
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
      id: w.id,
      action: w.propertyId ? "update" : "create",
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

/** Owner-only: every submission, newest first, pending ones easy to isolate
 *  client-side by `status`. `developerName`/`developerEmail` are resolved
 *  here (rather than inside `listV2Submissions`) against the shared
 *  `admin_profiles` table. */
export const listSubmissions = createServerFn({ method: "GET" })
  .middleware([requireOwnerAuth])
  .handler(async (): Promise<SubmissionListItem[]> => {
    const items = await listV2Submissions();
    if (!items.length) return [];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const developerIds = Array.from(new Set(items.map((v) => v.developerId)));
    const { data: developers } = developerIds.length
      ? await supabaseAdmin
          .from("admin_profiles")
          .select("id, email, full_name")
          .in("id", developerIds)
      : { data: [] };
    const byId = new Map((developers ?? []).map((d) => [d.id, d]));

    return items
      .map((item) => {
        const dev = byId.get(item.developerId);
        return {
          ...item,
          developerName: dev?.full_name ?? dev?.email ?? "Unknown developer",
          developerEmail: dev?.email ?? "",
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  });

/** Owner-only: one submission's full payload, for the review screen. Loads
 *  the workflow's current revision and runs it through C3a's reverse mapper
 *  so the review dialog's existing `PayloadPreview` (built for V1's flat
 *  `PropertyFormValues`) needs no changes to render it. */
export const getSubmission = createServerFn({ method: "GET" })
  .middleware([requireOwnerAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Missing submission id");
    return { id: data.id };
  })
  .handler(async ({ data }) => {
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
      .where(eq(propertySubmissionWorkflows.id, data.id))
      .limit(1);
    if (!workflow) throw new Error("Submission not found");

    const [revisionRow] = await db
      .select({ payload: propertySubmissionRevisions.submittedPayload })
      .from(propertySubmissionRevisions)
      .where(
        and(
          eq(propertySubmissionRevisions.workflowId, data.id),
          eq(propertySubmissionRevisions.revision, workflow.currentRevision),
        ),
      )
      .limit(1);
    if (!revisionRow) throw new Error("Submission not found");

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
            .where(eq(reviewActions.workflowId, data.id))
            .orderBy(desc(reviewActions.createdAt))
            .limit(1);

    return {
      id: workflow.id,
      action: (workflow.propertyId ? "update" : "create") as "create" | "update",
      status: v2Status(workflow.state),
      propertyId: workflow.propertyId,
      developerId: workflow.developerId,
      payload,
      reviewerNote: latestAction?.reason ?? null,
      createdAt: workflow.createdAt.toISOString(),
    };
  });

/** Owner-only: approving IS publishing — V2 revisions are already validated
 *  and immutable, so there is nothing left to build a row from. A create
 *  (`workflow.propertyId` null) makes a brand-new `properties` row via
 *  `publishWorkflow`'s own `createPropertyIdentity`; an update publishes a new
 *  version onto the existing one. */
export const approveSubmission = createServerFn({ method: "POST" })
  .middleware([requireOwnerAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Missing submission id");
    return { id: data.id };
  })
  .handler(async ({ data, context }) => {
    const { publishWorkflow } = await import("@/repositories/publication.repository.server");
    const result = await publishWorkflow(data.id, context.adminProfile.id);
    return { ok: true, propertyId: result.propertyId };
  });

/** Owner-only: rejects by driving the workflow's own state machine
 *  (`adjudicateWorkflow`) rather than a status column. The developer sees the
 *  note on their dashboard; a rejected create/update has no in-place
 *  resubmit — they submit again from scratch. */
export const rejectSubmission = createServerFn({ method: "POST" })
  .middleware([requireOwnerAuth])
  .inputValidator((data: { id: string; note?: string }) => {
    if (!data?.id) throw new Error("Missing submission id");
    return { id: data.id, note: data.note?.trim() || null };
  })
  .handler(async ({ data, context }) => {
    const { getDatabase } = await import("@/db/client.server");
    const { propertySubmissionWorkflows } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { adjudicateWorkflow } =
      await import("@/repositories/submission-workflow.repository.server");

    const db = getDatabase();
    const [workflow] = await db
      .select({ state: propertySubmissionWorkflows.state })
      .from(propertySubmissionWorkflows)
      .where(eq(propertySubmissionWorkflows.id, data.id))
      .limit(1);
    if (!workflow) throw new Error("Submission not found");
    if (workflow.state !== "in_review") {
      throw new Error("This submission has already been reviewed");
    }

    await adjudicateWorkflow(data.id, context.adminProfile.id, "rejected", data.note ?? "");
    return { ok: true };
  });
