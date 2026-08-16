import { customerPreferences } from "@/db/schema";
import { getDatabase } from "@/db/client.server";
import { getBudgetBand } from "@/domain/budget";
import type { RecommendationRequest } from "@/contracts/consumer";

export async function saveConfirmedPreferences(profileId: string, input: RecommendationRequest) {
  const budget = getBudgetBand(input.budgetBandId);
  const db = getDatabase();
  await db
    .insert(customerPreferences)
    .values({
      profileId,
      marketId: input.marketId,
      configurationOptionIds: input.configurationOptionIds,
      budgetBandId: input.budgetBandId,
      budgetMinRupees: budget.minimumRupees,
      budgetMaxRupees: budget.maximumRupees,
      propertyTypeIds: input.propertyTypeIds ?? [],
      confirmedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: customerPreferences.profileId,
      set: {
        marketId: input.marketId,
        configurationOptionIds: input.configurationOptionIds,
        budgetBandId: input.budgetBandId,
        budgetMinRupees: budget.minimumRupees,
        budgetMaxRupees: budget.maximumRupees,
        propertyTypeIds: input.propertyTypeIds ?? [],
        confirmedAt: new Date(),
      },
    });
  return { ok: true as const };
}
