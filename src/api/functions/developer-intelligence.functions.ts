import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireDeveloperAuth, requireOwnerAuth } from "@/lib/auth/admin-auth-middleware";
import {
  assertIntelligencePayloadSafe,
  type BehaviourMetrics,
  type SentimentMetric,
} from "@/domain/developer-intelligence";

export interface IntelligenceEntitlementView {
  active: boolean;
  accessLevel: "trial" | "paid" | null;
  status: "active" | "suspended" | "missing";
  startsAt: string | null;
  endsAt: string | null;
}

export interface IntelligenceProjectSummary {
  id: string;
  slug: string;
  name: string;
  comparisonVolume: number | null;
  suppressed: boolean;
}

export interface DeveloperIntelligenceIndex {
  featureEnabled: boolean;
  entitlement: IntelligenceEntitlementView;
  projects: IntelligenceProjectSummary[];
}

export interface DeveloperProjectIntelligence {
  project: { id: string; slug: string; name: string };
  period: { days: 30; generatedAt: string };
  behaviour: Omit<BehaviourMetrics, "competitors"> & {
    competitors: Array<BehaviourMetrics["competitors"][number] & { name: string }>;
  };
  sentiment: SentimentMetric[];
}

async function loadProjectIntelligence(
  developerId: string,
  propertyId: string,
  now = new Date(),
): Promise<DeveloperProjectIntelligence> {
  const repository = await import("@/repositories/developer-intelligence.repository.server");
  const property = await repository.findOwnedPublishedProperty(developerId, propertyId);
  const bandId = await repository.propertyBudgetBandId(property.currentPublicationVersionId);
  const analytics = await import("@/server/developer-intelligence-analytics.server");
  const [behaviour, sentiment] = await Promise.all([
    analytics.getBehaviour(property.slug, bandId, now),
    repository.projectSentiment(property.id, now),
  ]);
  const names = await repository.propertyNamesBySlugs(
    behaviour.competitors.map((competitor) => competitor.slug),
  );
  const response = {
    project: { id: property.id, slug: property.slug, name: property.name },
    period: { days: 30 as const, generatedAt: now.toISOString() },
    behaviour: {
      ...behaviour,
      competitors: behaviour.competitors.map((competitor) => ({
        ...competitor,
        name: names.get(competitor.slug) ?? "Published project",
      })),
    },
    sentiment,
  };
  assertIntelligencePayloadSafe(response);
  return response;
}

export const getMyDeveloperIntelligenceIndex = createServerFn({ method: "GET" })
  .middleware([requireDeveloperAuth])
  .handler(async ({ context }): Promise<DeveloperIntelligenceIndex> => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { isFeatureEnabled } = await import("@/server/feature-flags.server");
    const repository = await import("@/repositories/developer-intelligence.repository.server");
    const featureEnabled = isFeatureEnabled("V2_DEVELOPER_INTELLIGENCE");
    const entitlement = repository.entitlementView(
      await repository.findEntitlement(context.adminProfile.id),
    );
    const properties = await repository.listOwnedPublishedProperties(context.adminProfile.id);
    if (!featureEnabled || !entitlement.active) {
      return {
        featureEnabled,
        entitlement,
        projects: properties.map((property) => ({
          id: property.id,
          slug: property.slug,
          name: property.name,
          comparisonVolume: null,
          suppressed: true,
        })),
      };
    }
    const projects = await Promise.all(
      properties.map(async (property) => {
        const detail = await loadProjectIntelligence(context.adminProfile.id, property.id);
        return {
          id: property.id,
          slug: property.slug,
          name: property.name,
          comparisonVolume: detail.behaviour.comparisonVolume.suppressed
            ? null
            : detail.behaviour.comparisonVolume.current,
          suppressed: detail.behaviour.comparisonVolume.suppressed,
        };
      }),
    );
    return { featureEnabled, entitlement, projects };
  });

export const getMyDeveloperProjectIntelligence = createServerFn({ method: "GET" })
  .middleware([requireDeveloperAuth])
  .inputValidator((data: unknown) =>
    z.object({ propertyId: z.string().uuid() }).strict().parse(data),
  )
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { requireFeature } = await import("@/server/feature-flags.server");
    requireFeature("V2_DEVELOPER_INTELLIGENCE");
    const repository = await import("@/repositories/developer-intelligence.repository.server");
    const entitlement = await repository.findEntitlement(context.adminProfile.id);
    if (!repository.entitlementView(entitlement).active)
      throw new Error("Intelligence access unavailable");
    return loadProjectIntelligence(context.adminProfile.id, data.propertyId);
  });

export const setDeveloperIntelligenceEntitlement = createServerFn({ method: "POST" })
  .middleware([requireOwnerAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        developerId: z.string().uuid(),
        accessLevel: z.enum(["trial", "paid"]),
        status: z.enum(["active", "suspended"]),
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime().nullable(),
        note: z.string().trim().max(500).nullable(),
      })
      .strict()
      .superRefine((value, context) => {
        if (value.endsAt && new Date(value.endsAt) <= new Date(value.startsAt)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "End date must follow start date",
          });
        }
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const repository = await import("@/repositories/developer-intelligence.repository.server");
    return repository.upsertEntitlement(context.adminProfile.id, data);
  });
