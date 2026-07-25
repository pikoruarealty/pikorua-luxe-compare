import { createServerFn } from "@tanstack/react-start";
import { requireOwnerAuth } from "@/integrations/supabase/admin-auth-middleware";
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

interface ProfileRow {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  profession: string | null;
  business_name: string | null;
  quiz_answers: unknown;
  created_at: string;
}

/** Owner-only: every customer who signed up, with their quiz answers + activity totals. */
export const getCustomers = createServerFn({ method: "GET" })
  .middleware([requireOwnerAuth])
  .handler(async (): Promise<CustomerSummary[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id, phone, name, email, profession, business_name, quiz_answers, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // One pass over activity to build per-profile counts, rather than N queries.
    const { data: activity } = await supabaseAdmin
      .from("customer_activity")
      .select("profile_id, created_at")
      .not("profile_id", "is", null);

    const counts = new Map<string, { count: number; last: string }>();
    for (const a of (activity ?? []) as { profile_id: string; created_at: string }[]) {
      const prev = counts.get(a.profile_id);
      if (!prev) counts.set(a.profile_id, { count: 1, last: a.created_at });
      else {
        prev.count += 1;
        if (a.created_at > prev.last) prev.last = a.created_at;
      }
    }

    return (profiles as ProfileRow[]).map((p) => {
      const c = counts.get(p.id);
      return {
        id: p.id,
        name: p.name,
        phone: p.phone,
        email: p.email,
        profession: p.profession,
        businessName: p.business_name,
        quizAnswers: (p.quiz_answers as QuizAnswersDTO | null) ?? null,
        createdAt: p.created_at,
        activityCount: c?.count ?? 0,
        lastActiveAt: c?.last ?? null,
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: p, error } = await supabaseAdmin
      .from("profiles")
      .select("id, phone, name, email, profession, business_name, quiz_answers, created_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !p) throw new Error(error?.message ?? "Customer not found");

    const { data: rows } = await supabaseAdmin
      .from("customer_activity")
      .select("id, event_type, property_slug, created_at")
      .eq("profile_id", data.id)
      .order("created_at", { ascending: false })
      .limit(500);

    const activityRows = (rows ?? []) as {
      id: string;
      event_type: ActivityEvent;
      property_slug: string | null;
      created_at: string;
    }[];

    // Resolve slugs → names so the timeline reads in plain language.
    const slugs = [
      ...new Set(activityRows.map((r) => r.property_slug).filter(Boolean)),
    ] as string[];
    const nameBySlug = new Map<string, string>();
    if (slugs.length) {
      const { data: props } = await supabaseAdmin
        .from("properties")
        .select("slug, name")
        .in("slug", slugs);
      for (const row of (props ?? []) as { slug: string; name: string }[]) {
        nameBySlug.set(row.slug, row.name);
      }
    }

    const row = p as ProfileRow;
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      profession: row.profession,
      businessName: row.business_name,
      quizAnswers: (row.quiz_answers as QuizAnswersDTO | null) ?? null,
      createdAt: row.created_at,
      activityCount: activityRows.length,
      lastActiveAt: activityRows[0]?.created_at ?? null,
      activity: activityRows.map((a) => ({
        id: a.id,
        event: a.event_type,
        propertySlug: a.property_slug,
        propertyName: a.property_slug ? (nameBySlug.get(a.property_slug) ?? null) : null,
        createdAt: a.created_at,
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
      properties,
      publishedProperties,
      pendingSubmissions,
      totalInteractions,
      anonymousInteractions,
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("*", head),
      supabaseAdmin.from("profiles").select("*", head).not("quiz_answers", "is", null),
      supabaseAdmin.from("properties").select("*", head),
      supabaseAdmin.from("properties").select("*", head).eq("is_published", true),
      supabaseAdmin.from("property_submissions").select("*", head).eq("status", "pending"),
      supabaseAdmin.from("customer_activity").select("*", head),
      supabaseAdmin.from("customer_activity").select("*", head).is("profile_id", null),
    ]);

    return {
      customers: customers.count ?? 0,
      quizCompleted: quizCompleted.count ?? 0,
      properties: properties.count ?? 0,
      publishedProperties: publishedProperties.count ?? 0,
      pendingSubmissions: pendingSubmissions.count ?? 0,
      totalInteractions: totalInteractions.count ?? 0,
      anonymousInteractions: anonymousInteractions.count ?? 0,
    };
  });
