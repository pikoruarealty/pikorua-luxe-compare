import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AreaUnit } from "@/lib/area-units";

interface AreaUnitState {
  unit: AreaUnit;
  setUnit: (unit: AreaUnit) => void;
}

/** One global choice for how area figures display across every comparison
 *  table — dimensions in feet/inches are unaffected, only the sq ft numbers. */
export const useAreaUnitStore = create<AreaUnitState>()(
  persist((set) => ({ unit: "sqft", setUnit: (unit) => set({ unit }) }), {
    name: "pikorua-area-unit",
  }),
);
