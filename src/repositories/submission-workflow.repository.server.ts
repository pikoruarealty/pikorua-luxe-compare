import { and, eq, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client.server";
import {
  auditEvents,
  propertySubmissionRevisions,
  propertySubmissionWorkflows,
  reviewActions,
} from "@/db/schema";
import {
  assertSubmissionTransition,
  publicationRevisionSchema,
  type SubmissionState,
} from "@/domain/publication";

export async function saveDeveloperRevision(
  developerId: string,
  payload: unknown,
  workflowId?: string,
) {
  const revision = publicationRevisionSchema.parse(payload);
  const db = getDatabase();
  return db.transaction(async (tx) => {
    let workflow: typeof propertySubmissionWorkflows.$inferSelect | undefined;
    if (workflowId) {
      await tx.execute(
        sql`select id from property_submission_workflows where id = ${workflowId} for update`,
      );
      [workflow] = await tx
        .select()
        .from(propertySubmissionWorkflows)
        .where(
          and(
            eq(propertySubmissionWorkflows.id, workflowId),
            eq(propertySubmissionWorkflows.developerId, developerId),
          ),
        )
        .limit(1);
      if (!workflow) throw new Error("Submission workflow not found");
      if (workflow.state !== "draft" && workflow.state !== "changes_requested") {
        throw new Error("This submission is not editable");
      }
    } else {
      [workflow] = await tx
        .insert(propertySubmissionWorkflows)
        .values({ developerId, state: "draft", currentRevision: 0 })
        .returning();
    }
    if (!workflow) throw new Error("Could not create submission workflow");

    const nextRevision = workflow.currentRevision + 1;
    const [created] = await tx
      .insert(propertySubmissionRevisions)
      .values({
        workflowId: workflow.id,
        revision: nextRevision,
        schemaVersion: revision.schemaVersion,
        submittedPayload: revision,
        createdBy: developerId,
      })
      .returning({ id: propertySubmissionRevisions.id });
    await tx
      .update(propertySubmissionWorkflows)
      .set({ currentRevision: nextRevision })
      .where(eq(propertySubmissionWorkflows.id, workflow.id));
    await tx.insert(auditEvents).values({
      actorType: "developer",
      actorId: developerId,
      action: "submission.revision_created",
      entityType: "property_submission_workflow",
      entityId: workflow.id,
      metadata: { revision: nextRevision },
    });
    return { workflowId: workflow.id, revisionId: created.id, revision: nextRevision };
  });
}

export async function submitDeveloperWorkflow(workflowId: string, developerId: string) {
  const db = getDatabase();
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from property_submission_workflows where id = ${workflowId} for update`,
    );
    const [workflow] = await tx
      .select()
      .from(propertySubmissionWorkflows)
      .where(
        and(
          eq(propertySubmissionWorkflows.id, workflowId),
          eq(propertySubmissionWorkflows.developerId, developerId),
        ),
      )
      .limit(1);
    if (!workflow) throw new Error("Submission workflow not found");
    const from = workflow.state as SubmissionState;
    assertSubmissionTransition(from, "submitted");

    const [revision] = await tx
      .select({ payload: propertySubmissionRevisions.submittedPayload })
      .from(propertySubmissionRevisions)
      .where(
        and(
          eq(propertySubmissionRevisions.workflowId, workflowId),
          eq(propertySubmissionRevisions.revision, workflow.currentRevision),
        ),
      )
      .limit(1);
    if (!revision) throw new Error("Add a revision before submitting");
    publicationRevisionSchema.parse(revision.payload);

    // Validation is synchronous in this release; the explicit action trail
    // preserves every state even though no queue wait is needed between them.
    assertSubmissionTransition("submitted", "validating");
    assertSubmissionTransition("validating", "in_review");
    await tx
      .update(propertySubmissionWorkflows)
      .set({ state: "in_review" })
      .where(eq(propertySubmissionWorkflows.id, workflowId));
    await tx.insert(auditEvents).values([
      {
        actorType: "developer",
        actorId: developerId,
        action: "submission.submitted",
        entityType: "property_submission_workflow",
        entityId: workflowId,
        metadata: {},
      },
      {
        actorType: "system",
        action: "submission.validated",
        entityType: "property_submission_workflow",
        entityId: workflowId,
        metadata: { result: "passed" },
      },
    ]);
    return { state: "in_review" as const };
  });
}

export async function adjudicateWorkflow(
  workflowId: string,
  reviewerId: string,
  action: "changes_requested" | "rejected",
  reason: string,
) {
  const db = getDatabase();
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from property_submission_workflows where id = ${workflowId} for update`,
    );
    const [workflow] = await tx
      .select()
      .from(propertySubmissionWorkflows)
      .where(eq(propertySubmissionWorkflows.id, workflowId))
      .limit(1);
    if (!workflow) throw new Error("Submission workflow not found");
    assertSubmissionTransition(workflow.state as SubmissionState, action);
    const [current] = await tx
      .select({ id: propertySubmissionRevisions.id })
      .from(propertySubmissionRevisions)
      .where(
        and(
          eq(propertySubmissionRevisions.workflowId, workflowId),
          eq(propertySubmissionRevisions.revision, workflow.currentRevision),
        ),
      )
      .limit(1);
    await tx
      .update(propertySubmissionWorkflows)
      .set({ state: action })
      .where(eq(propertySubmissionWorkflows.id, workflowId));
    await tx.insert(reviewActions).values({
      workflowId,
      submissionRevisionId: current?.id,
      actorId: reviewerId,
      action,
      reason,
    });
    await tx.insert(auditEvents).values({
      actorType: "staff",
      actorId: reviewerId,
      action: `submission.${action}`,
      entityType: "property_submission_workflow",
      entityId: workflowId,
      reason,
      metadata: {},
    });
    return { state: action };
  });
}
