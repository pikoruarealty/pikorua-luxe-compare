import { z } from "zod";

export interface BudgetBand {
  id: string;
  broadLabel: string;
  label: string;
  minimumRupees: number;
  maximumRupees: number | null;
}

const CRORE = 10_000_000;

export const BUDGET_BANDS = [
  {
    id: "1_2_cr",
    broadLabel: "₹1–5Cr",
    label: "₹1–2Cr",
    minimumRupees: 1 * CRORE,
    maximumRupees: 2 * CRORE,
  },
  {
    id: "3_4_cr",
    broadLabel: "₹1–5Cr",
    label: "₹3–4Cr",
    minimumRupees: 3 * CRORE,
    maximumRupees: 4 * CRORE,
  },
  {
    id: "5_cr",
    broadLabel: "₹1–5Cr",
    label: "₹5Cr",
    minimumRupees: 4 * CRORE,
    maximumRupees: 5.5 * CRORE,
  },
  {
    id: "6_7_cr",
    broadLabel: "₹6–10Cr",
    label: "₹6–7Cr",
    minimumRupees: 6 * CRORE,
    maximumRupees: 7 * CRORE,
  },
  {
    id: "8_9_cr",
    broadLabel: "₹6–10Cr",
    label: "₹8–9Cr",
    minimumRupees: 8 * CRORE,
    maximumRupees: 9 * CRORE,
  },
  {
    id: "10_cr",
    broadLabel: "₹6–10Cr",
    label: "₹10Cr",
    minimumRupees: 9 * CRORE,
    maximumRupees: 10.5 * CRORE,
  },
  {
    id: "11_12_cr",
    broadLabel: "₹11–15Cr",
    label: "₹11–12Cr",
    minimumRupees: 11 * CRORE,
    maximumRupees: 12 * CRORE,
  },
  {
    id: "13_14_cr",
    broadLabel: "₹11–15Cr",
    label: "₹13–14Cr",
    minimumRupees: 13 * CRORE,
    maximumRupees: 14 * CRORE,
  },
  {
    id: "15_cr",
    broadLabel: "₹11–15Cr",
    label: "₹15Cr",
    minimumRupees: 14 * CRORE,
    maximumRupees: 15.5 * CRORE,
  },
  {
    id: "16_17_cr",
    broadLabel: "₹16–20Cr",
    label: "₹16–17Cr",
    minimumRupees: 16 * CRORE,
    maximumRupees: 17 * CRORE,
  },
  {
    id: "18_19_cr",
    broadLabel: "₹16–20Cr",
    label: "₹18–19Cr",
    minimumRupees: 18 * CRORE,
    maximumRupees: 19 * CRORE,
  },
  {
    id: "20_cr",
    broadLabel: "₹16–20Cr",
    label: "₹20Cr",
    minimumRupees: 19 * CRORE,
    maximumRupees: 20.5 * CRORE,
  },
  {
    id: "21_cr_plus",
    broadLabel: "₹21Cr+",
    label: "₹21Cr+",
    minimumRupees: 21 * CRORE,
    maximumRupees: null,
  },
] as const satisfies readonly BudgetBand[];

export const budgetBandIdSchema = z.enum(
  BUDGET_BANDS.map((band) => band.id) as [string, ...string[]],
);

export function getBudgetBand(id: string): BudgetBand {
  const band = BUDGET_BANDS.find((candidate) => candidate.id === id);
  if (!band) throw new Error("Invalid budget band");
  return band;
}
