import type { AreaUnit } from "@/generated/property-contract";

// Conversion factors to square feet, per Part 3.5's canonical unit list.
// Gaj is the North Indian survey unit and is numerically identical to sq_yd.
const SQ_FT_PER_UNIT: Record<AreaUnit, number> = {
  sq_ft: 1,
  sq_m: 10.7639,
  sq_yd: 9,
  gaj: 9,
  acre: 43_560,
};

export function toSqFt(value: number, unit: AreaUnit): number {
  return value * SQ_FT_PER_UNIT[unit];
}

export function fromSqFt(valueInSqFt: number, unit: AreaUnit): number {
  return valueInSqFt / SQ_FT_PER_UNIT[unit];
}

export function convertArea(value: number, fromUnit: AreaUnit, toUnit: AreaUnit): number {
  return fromSqFt(toSqFt(value, fromUnit), toUnit);
}
