import { createServerFn } from "@tanstack/react-start";
import { throwSafeError } from "@/lib/safe-error";
import { requireAdminAuth } from "@/lib/auth/admin-auth-middleware";
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

export interface DeveloperDraft {
  workflowId: string;
  action: "create" | "update";
  propertyId: string | null;
  propertyName: string;
  createdAt: string;
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

/** Every create or update this developer has ever submitted through the V2
 *  workflow queue (submitV2PropertyCreate / submitV2PropertyUpdate). A rejected
 *  submission has no "reopen in place" path — each attempt is its own immutable
 *  workflow, so fixing one just means resubmitting the property. */
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
    };
  });
}

/** Draft (and changes-requested) workflows this developer hasn't submitted
 *  yet — including ones a script queued on their behalf, e.g. the retrospective
 *  approval backfill. `draft`/`changes_requested` are excluded from
 *  getMyV2Submissions on purpose (that list is "things I've submitted"); this
 *  is "things waiting on me to submit". */
async function getMyV2Drafts(developerId: string): Promise<DeveloperDraft[]> {
  const { eq, and, inArray, desc } = await import("drizzle-orm");
  const { getDatabase } = await import("@/db/client.server");
  const { propertySubmissionWorkflows, propertySubmissionRevisions } = await import("@/db/schema");

  const db = getDatabase();
  const workflows = await db
    .select({
      id: propertySubmissionWorkflows.id,
      propertyId: propertySubmissionWorkflows.propertyId,
      currentRevision: propertySubmissionWorkflows.currentRevision,
      createdAt: propertySubmissionWorkflows.createdAt,
    })
    .from(propertySubmissionWorkflows)
    .where(
      and(
        eq(propertySubmissionWorkflows.developerId, developerId),
        inArray(propertySubmissionWorkflows.state, ["draft", "changes_requested"]),
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

  return workflows.map((w) => ({
    workflowId: w.id,
    action: (w.propertyId ? "update" : "create") as "create" | "update",
    propertyId: w.propertyId,
    propertyName: nameByWorkflow.get(w.id) ?? "Untitled property",
    createdAt: w.createdAt.toISOString(),
  }));
}

/** Developer-only: their live properties plus their full submission history —
 *  the dashboard renders both (live ones are editable, submissions show what's
 *  pending/rejected/approved). Both come from the V2 local-Postgres catalogue
 *  — see getMyV2Properties/getMyV2Submissions. */
export const getMyDeveloperDashboard = createServerFn({ method: "GET" })
  .middleware([requireAdminAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      properties: DeveloperProperty[];
      submissions: DeveloperSubmission[];
      drafts: DeveloperDraft[];
    }> => {
      const developerId = context.adminProfile.id;
      const [properties, submissions, drafts] = await Promise.all([
        getMyV2Properties(developerId),
        getMyV2Submissions(developerId),
        getMyV2Drafts(developerId),
      ]);
      return { properties, submissions, drafts };
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
  brochureJobId?: string,
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

  const { workflowId } = await saveDeveloperRevision(
    developerId,
    revision,
    undefined,
    propertyId,
    brochureJobId,
  );
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
  brochureJobId?: string,
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

  const { workflowId } = await saveDeveloperRevision(
    developerId,
    revision,
    undefined,
    undefined,
    brochureJobId,
  );
  await submitDeveloperWorkflow(workflowId, developerId);
  return { ok: true };
}

/** Developer-only: loads a draft (or changes-requested) workflow of THEIR OWN
 *  into the edit form shape, so they can review it before submitting — the
 *  counterpart to getMyDraftForReview's sibling submitMyDraftSubmission below.
 *  Unlike getMyV2PropertyForEdit (which always reads the live, published
 *  revision), this reads the workflow's own current revision, which is the
 *  only place an as-yet-unpublished create draft's content exists at all. */
export const getMyDraftForReview = createServerFn({ method: "GET" })
  .middleware([requireAdminAuth])
  .inputValidator((data: { workflowId: string }) => {
    if (!data?.workflowId) throw new Error("Missing workflow id");
    return { workflowId: data.workflowId };
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<PropertyFormValues & { workflowId: string; action: "create" | "update" }> => {
      const { eq, and } = await import("drizzle-orm");
      const { getDatabase } = await import("@/db/client.server");
      const { propertySubmissionWorkflows, propertySubmissionRevisions, markets } =
        await import("@/db/schema");
      const { publicationRevisionSchema } = await import("@/domain/publication");
      const { buildFormValuesFromRevision } = await import("@/domain/publication-to-form.server");

      const db = getDatabase();
      const [workflow] = await db
        .select({
          id: propertySubmissionWorkflows.id,
          propertyId: propertySubmissionWorkflows.propertyId,
          state: propertySubmissionWorkflows.state,
          currentRevision: propertySubmissionWorkflows.currentRevision,
        })
        .from(propertySubmissionWorkflows)
        .where(
          and(
            eq(propertySubmissionWorkflows.id, data.workflowId),
            eq(propertySubmissionWorkflows.developerId, context.adminProfile.id),
          ),
        )
        .limit(1);
      if (!workflow) throw new Error("Draft not found");
      if (workflow.state !== "draft" && workflow.state !== "changes_requested") {
        throw new Error("This submission is no longer a draft");
      }

      const [revisionRow] = await db
        .select({ payload: propertySubmissionRevisions.submittedPayload })
        .from(propertySubmissionRevisions)
        .where(
          and(
            eq(propertySubmissionRevisions.workflowId, workflow.id),
            eq(propertySubmissionRevisions.revision, workflow.currentRevision),
          ),
        )
        .limit(1);
      if (!revisionRow) throw new Error("Draft has no revision to review");

      const revision = publicationRevisionSchema.parse(revisionRow.payload);
      const [market] = await db
        .select({ stateName: markets.stateName, cityName: markets.cityName })
        .from(markets)
        .where(eq(markets.id, revision.marketId))
        .limit(1);

      const values = buildFormValuesFromRevision(revision, {
        stateName: market?.stateName,
        cityName: market?.cityName,
      });
      return {
        ...values,
        workflowId: workflow.id,
        action: workflow.propertyId ? "update" : "create",
      };
    },
  );

/** Developer-only: submits a draft (or changes-requested) workflow of THEIR
 *  OWN that's already sitting there — e.g. one a backfill script queued on
 *  their behalf — landing it in the same review queue a fresh
 *  submitPropertyForReview call would. Reuses the workflow's own id via
 *  saveDeveloperRevision rather than opening a new one, so this is a
 *  continuation of that draft, not a duplicate. */
export const submitMyDraftSubmission = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((data: { workflowId: string; values: PropertyFormValues }) => {
    if (!data?.workflowId) throw new Error("Missing workflow id");
    return { workflowId: data.workflowId, values: parsePropertySubmission(data.values) };
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { eq, and, ilike } = await import("drizzle-orm");
    const { getDatabase } = await import("@/db/client.server");
    const { propertySubmissionWorkflows, configurationOptions, markets } =
      await import("@/db/schema");
    const { buildPublicationRevision } = await import("@/domain/publication-mapping.server");
    const { saveDeveloperRevision, submitDeveloperWorkflow } =
      await import("@/repositories/submission-workflow.repository.server");

    const db = getDatabase();
    const developerId = context.adminProfile.id;
    const [workflow] = await db
      .select({
        id: propertySubmissionWorkflows.id,
        propertyId: propertySubmissionWorkflows.propertyId,
        state: propertySubmissionWorkflows.state,
      })
      .from(propertySubmissionWorkflows)
      .where(
        and(
          eq(propertySubmissionWorkflows.id, data.workflowId),
          eq(propertySubmissionWorkflows.developerId, developerId),
        ),
      )
      .limit(1);
    if (!workflow) throw new Error("Draft not found");
    if (workflow.state !== "draft" && workflow.state !== "changes_requested") {
      throw new Error("This submission is no longer a draft");
    }

    const [market] = await db
      .select({ id: markets.id, stateCode: markets.stateCode, cityCode: markets.cityCode })
      .from(markets)
      .where(
        and(
          eq(markets.isEnabled, true),
          ilike(markets.stateName, data.values.state.trim()),
          ilike(markets.cityName, data.values.city.trim()),
        ),
      )
      .limit(1);
    if (!market) {
      throw new Error(`No enabled market matches "${data.values.city}, ${data.values.state}"`);
    }

    const optionRows = await db
      .select({ id: configurationOptions.id, kind: configurationOptions.kind })
      .from(configurationOptions);
    const configurationOptionsByKind = new Map(optionRows.map((row) => [row.kind, row.id]));

    const revision = buildPublicationRevision(data.values, {
      configurationOptionsByKind,
      marketId: market.id,
      stateCode: market.stateCode,
      cityCode: market.cityCode,
    });

    await saveDeveloperRevision(
      developerId,
      revision,
      workflow.id,
      workflow.propertyId ?? undefined,
    );
    await submitDeveloperWorkflow(workflow.id, developerId);
    return { ok: true };
  });

/** Developer-only: creates a pending review request. Never writes to
 *  `properties` directly — an owner approval is what actually publishes a new
 *  property or applies an edit to a live one (see admin-submissions.functions.ts).
 *  Both "create" and "update" go into the V2 workflow queue (see
 *  submitV2PropertyCreate/submitV2PropertyUpdate) — ownership for an update is
 *  re-checked inside submitV2PropertyUpdate itself. */
// Matches insertBrochureJob's generator (crypto.randomUUID, hyphens
// stripped, sliced to 24) — see createBrochureUploadTicket.
const JOB_ID_RE = /^[a-f0-9]{12,32}$/;

export const submitPropertyForReview = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator(
    (data: {
      action: "create" | "update";
      propertyId?: string;
      jobId?: string;
      values: PropertyFormValues;
    }) => {
      if (data?.action !== "create" && data?.action !== "update") {
        throw new Error("Invalid action");
      }
      if (data.action === "update" && !data.propertyId) {
        throw new Error("Missing property id for an update submission");
      }
      if (data.jobId && !JOB_ID_RE.test(data.jobId)) {
        throw new Error("Invalid job id");
      }
      return {
        action: data.action,
        propertyId: data.propertyId,
        jobId: data.jobId,
        values: parsePropertySubmission(data.values),
      };
    },
  )
  .handler(async ({ data, context }) => {
    if (data.action === "create") {
      return submitV2PropertyCreate(context.adminProfile.id, data.values, data.jobId);
    }
    return submitV2PropertyUpdate(
      data.propertyId as string, // guaranteed by the validator above
      context.adminProfile.id,
      data.values,
      data.jobId,
    );
  });
