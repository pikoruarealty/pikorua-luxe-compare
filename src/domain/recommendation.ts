import type { BudgetBand } from "./budget";

export type BudgetFit = "within" | "slightly_above" | "well_above" | "unknown";

export interface PrivateRecommendationVariant {
  id: string;
  configurationOptionId: string;
  privateUpperBoundRupees: number | null;
  premiumRank: number;
}

export interface PrivateRecommendationProject {
  id: string;
  name: string;
  variants: PrivateRecommendationVariant[];
  verifiedDataCompleteness: number;
}

export type RankedRecommendationProject<
  Project extends PrivateRecommendationProject = PrivateRecommendationProject,
> = Project & {
  primaryConfigurationId: string | null;
  availableConfigurationIds: string[];
  fit: BudgetFit;
  selectedConfigurationCoverage: number;
  isAlternativeConfiguration: boolean;
  privateDistanceFromBudget: number;
};

export function classifyBudgetFit(
  privateUpperBoundRupees: number | null,
  budgetMaximumRupees: number | null,
): BudgetFit {
  if (privateUpperBoundRupees === null) return "unknown";
  if (budgetMaximumRupees === null || privateUpperBoundRupees <= budgetMaximumRupees) {
    return "within";
  }
  return privateUpperBoundRupees * 100 <= budgetMaximumRupees * 120
    ? "slightly_above"
    : "well_above";
}

export function selectPrimaryVariant(
  variants: PrivateRecommendationVariant[],
  selectedConfigurationOptionIds: ReadonlySet<string>,
  budget: BudgetBand,
): PrivateRecommendationVariant | null {
  const selected = variants.filter((variant) =>
    selectedConfigurationOptionIds.has(variant.configurationOptionId),
  );
  if (!selected.length) return null;

  const priced = selected.filter(
    (variant): variant is PrivateRecommendationVariant & { privateUpperBoundRupees: number } =>
      variant.privateUpperBoundRupees !== null,
  );

  if (budget.maximumRupees === null) {
    return (
      [...priced].sort(
        (a, b) =>
          b.privateUpperBoundRupees - a.privateUpperBoundRupees || b.premiumRank - a.premiumRank,
      )[0] ?? [...selected].sort((a, b) => b.premiumRank - a.premiumRank)[0]
    );
  }

  const within = priced
    .filter((variant) => variant.privateUpperBoundRupees <= budget.maximumRupees!)
    .sort((a, b) => b.privateUpperBoundRupees - a.privateUpperBoundRupees);
  if (within[0]) return within[0];

  return (
    [...priced].sort((a, b) => a.privateUpperBoundRupees - b.privateUpperBoundRupees)[0] ??
    [...selected].sort((a, b) => b.premiumRank - a.premiumRank)[0]
  );
}

const fitOrder: Record<BudgetFit, number> = {
  within: 0,
  slightly_above: 1,
  well_above: 2,
  unknown: 3,
};

export function rankRecommendationProjects<Project extends PrivateRecommendationProject>(
  projects: Project[],
  selectedConfigurationOptionIds: string[],
  budget: BudgetBand,
): RankedRecommendationProject<Project>[] {
  const selectedIds = new Set(selectedConfigurationOptionIds);
  return projects
    .map((project): RankedRecommendationProject<Project> => {
      const selectedVariants = project.variants.filter((variant) =>
        selectedIds.has(variant.configurationOptionId),
      );
      const primary = selectPrimaryVariant(project.variants, selectedIds, budget);
      const upper = primary?.privateUpperBoundRupees ?? null;
      const fit = primary ? classifyBudgetFit(upper, budget.maximumRupees) : "unknown";
      const distance =
        upper === null || budget.maximumRupees === null
          ? 0
          : fit === "within"
            ? budget.maximumRupees - upper
            : upper - budget.maximumRupees;

      return {
        ...project,
        primaryConfigurationId: primary?.id ?? null,
        availableConfigurationIds: project.variants.map((variant) => variant.id),
        fit,
        selectedConfigurationCoverage: new Set(
          selectedVariants.map((variant) => variant.configurationOptionId),
        ).size,
        isAlternativeConfiguration: selectedVariants.length === 0,
        privateDistanceFromBudget: distance,
      };
    })
    .sort(
      (a, b) =>
        Number(a.isAlternativeConfiguration) - Number(b.isAlternativeConfiguration) ||
        fitOrder[a.fit] - fitOrder[b.fit] ||
        a.privateDistanceFromBudget - b.privateDistanceFromBudget ||
        b.selectedConfigurationCoverage - a.selectedConfigurationCoverage ||
        b.verifiedDataCompleteness - a.verifiedDataCompleteness ||
        a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
    );
}
