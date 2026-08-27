import { createServerFn } from "@tanstack/react-start";
import { requireOwnerAuth } from "@/integrations/supabase/admin-auth-middleware";
import {
  countProfiles,
  countProfilesWithQuiz,
  getProfileById,
  listAllProfiles,
} from "@/repositories/profile.repository.server";
import {
  countActivity,
  countAnonymousActivity,
  getActivityForProfile,
  getActivitySummaries,
} from "@/repositories/customer-activity.repository.server";
import type { QuizAnswersDTO } from "./profile.functions";
import type { ActivityEvent } from "./activity.functions";

export interface CustomerSummary {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  profession: string | null;
  businessName: string | null;
  quizAnswers: QuizAnswersDTO | null;
  createdAt: string;
  activityCount: number;
  lastActiveAt: string | null;
}

export interface ActivityEntry {
  id: string;
  event: ActivityEvent;
  propertySlug: string | null;
  propertyName: string | null;
  createdAt: string;
}

export interface CustomerDetail extends CustomerSummary {
  activity: ActivityEntry[];
}

export interface AdminStats {
  customers: number;
  quizCompleted: number;
  properties: number;
  publishedProperties: number;
  pendingSubmissions: number;
  totalInteractions: number;
  anonymousInteractions: number;
}

/** Owner-only: every customer who signed up, with their quiz answers + activity totals. */
export const getCustomers = createServerFn({ method: "GET" })
  .middleware([requireOwnerAuth])
  .handler(async (): Promise<CustomerSummary[]> => {
    const [profiles, summaries] = await Promise.all([listAllProfiles(), getActivitySummaries()]);
    const counts = new Map(summaries.map((row) => [row.profileId, row]));

    return profiles.map((p) => {
      const c = counts.get(p.id);
      return {
        id: p.id,
        name: p.name,
        phone: p.phone,
        email: p.email,
        profession: p.profession,
        businessName: p.businessName,
        quizAnswers: (p.quizAnswers as QuizAnswersDTO | null) ?? null,
        createdAt: p.createdAt.toISOString(),
        activityCount: c?.activityCount ?? 0,
        lastActiveAt: c?.lastActiveAt ? c.lastActiveAt.toISOString() : null,
      };
    });
  });

/** Owner-only: one customer with their full interaction timeline. */
export const getCustomerDetail = createServerFn({ method: "GET" })
  .middleware([requireOwnerAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id || typeof data.id !== "string") throw new Error("Missing customer id");
    return { id: data.id };
  })
  .handler(async ({ data }): Promise<CustomerDetail> => {
    const profile = await getProfileById(data.id);
    if (!profile) throw new Error("Customer not found");

    const activityRows = await getActivityForProfile(data.id);

    // Resolve slugs → names so the timeline reads in plain language.
    const slugs = [...new Set(activityRows.map((r) => r.propertySlug).filter(Boolean))] as string[];
    const nameBySlug = new Map<string, string>();
    if (slugs.length) {
      const { getDatabase } = await import("@/db/client.server");
      const { properties } = await import("@/db/schema");
      const { inArray } = await import("drizzle-orm");
      const props = await getDatabase()
        .select({ slug: properties.slug, name: properties.name })
        .from(properties)
        .where(inArray(properties.slug, slugs));
      for (const row of props) {
        nameBySlug.set(row.slug, row.name);
      }
    }

    return {
      id: profile.id,
      name: profile.name,
      phone: profile.phone,
      email: profile.email,
      profession: profile.profession,
      businessName: profile.businessName,
      quizAnswers: (profile.quizAnswers as QuizAnswersDTO | null) ?? null,
      createdAt: profile.createdAt.toISOString(),
      activityCount: activityRows.length,
      lastActiveAt: activityRows[0]?.createdAt ? activityRows[0].createdAt.toISOString() : null,
      activity: activityRows.map((a) => ({
        id: a.id,
        event: a.eventType as ActivityEvent,
        propertySlug: a.propertySlug,
        propertyName: a.propertySlug ? (nameBySlug.get(a.propertySlug) ?? null) : null,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  });

/** Owner-only: headline numbers for the dashboard. Property/submission counts
 *  read the V2 local-Postgres catalogue — the only place either lands now
 *  that Phase C retired the V1 Supabase create/review path. */
export const getAdminStats = createServerFn({ method: "GET" })
  .middleware([requireOwnerAuth])
  .handler(async (): Promise<AdminStats> => {
    const { getDatabase } = await import("@/db/client.server");
    const { properties, propertySubmissionWorkflows } = await import("@/db/schema");
    const { eq, sql } = await import("drizzle-orm");
    const db = getDatabase();
    const countOf = sql<number>`count(*)::int`;

    const [
      customers,
      quizCompleted,
      totalInteractions,
      anonymousInteractions,
      [propertiesRow],
      [publishedRow],
      [pendingRow],
    ] = await Promise.all([
      countProfiles(),
      countProfilesWithQuiz(),
      countActivity(),
      countAnonymousActivity(),
      db.select({ count: countOf }).from(properties),
      db.select({ count: countOf }).from(properties).where(eq(properties.isPublished, true)),
      db
        .select({ count: countOf })
        .from(propertySubmissionWorkflows)
        .where(eq(propertySubmissionWorkflows.state, "in_review")),
    ]);

    return {
      customers,
      quizCompleted,
      properties: propertiesRow?.count ?? 0,
      publishedProperties: publishedRow?.count ?? 0,
      pendingSubmissions: pendingRow?.count ?? 0,
      totalInteractions,
      anonymousInteractions,
    };
  });
