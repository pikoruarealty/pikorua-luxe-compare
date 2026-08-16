const FIVE_LAKH_RUPEES = 500_000;

export interface PrivatePriceBounds {
  lowerRupees: number;
  upperRupees: number;
}

export function calculatePrivatePriceBounds(baseSalePriceRupees: number): PrivatePriceBounds {
  if (
    !Number.isSafeInteger(baseSalePriceRupees) ||
    baseSalePriceRupees < 0 ||
    baseSalePriceRupees > Math.floor(Number.MAX_SAFE_INTEGER / 125)
  ) {
    throw new Error("Base sale price must be a non-negative integer number of rupees");
  }

  const denominator = 100 * FIVE_LAKH_RUPEES;
  const lowerRupees = Math.floor((baseSalePriceRupees * 75) / denominator) * FIVE_LAKH_RUPEES;
  const upperRupees = Math.ceil((baseSalePriceRupees * 125) / denominator) * FIVE_LAKH_RUPEES;

  return { lowerRupees, upperRupees };
}
