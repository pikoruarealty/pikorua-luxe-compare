import { createServerFn } from "@tanstack/react-start";
import { throwSafeError } from "@/lib/safe-error";
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
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: props, error: propsError } = await supabaseAdmin
        .from("properties")
        .select("slug, name")
        .in("slug", slugs);
      if (propsError) {
        throwSafeError("getCustomerDetail.properties", propsError, "Could not load property names");
      }
      for (const row of (props ?? []) as { slug: string; name: string }[]) {
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

/** Owner-only: headline numbers for the dashboard. */
export const getAdminStats = createServerFn({ method: "GET" })
  .middleware([requireOwnerAuth])
  .handler(async (): Promise<AdminStats> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const head = { count: "exact" as const, head: true };

    const [
      customers,
      quizCompleted,
      totalInteractions,
      anonymousInteractions,
      properties,
      publishedProperties,
      pendingSubmissions,
    ] = await Promise.all([
      countProfiles(),
      countProfilesWithQuiz(),
      countActivity(),
      countAnonymousActivity(),
      supabaseAdmin.from("properties").select("*", head),
      supabaseAdmin.from("properties").select("*", head).eq("is_published", true),
      supabaseAdmin.from("property_submissions").select("*", head).eq("status", "pending"),
    ]);

    return {
      customers,
      quizCompleted,
      properties: properties.count ?? 0,
      publishedProperties: publishedProperties.count ?? 0,
      pendingSubmissions: pendingSubmissions.count ?? 0,
      totalInteractions,
      anonymousInteractions,
    };
  });
