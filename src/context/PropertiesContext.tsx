import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Property } from "@/types/property";

interface PropertiesContextValue {
  properties: Property[];
  getPropertyById: (id: string | undefined) => Property | undefined;
}

const PropertiesContext = createContext<PropertiesContextValue | null>(null);

/**
 * Live property catalog, loaded once in the root route loader and served to the
 * whole app. Replaces the old synchronous `import { properties } from "@/data/properties"`
 * now that the database is the source of truth — root-loader data is serialised
 * into the SSR payload, so consumers still read it synchronously with no
 * loading state or first-paint flash.
 */
export function PropertiesProvider({
  properties,
  children,
}: {
  properties: Property[];
  children: ReactNode;
}) {
  const value = useMemo<PropertiesContextValue>(() => {
    const byId = new Map(properties.map((p) => [p.id, p]));
    return {
      properties,
      getPropertyById: (id) => (id ? byId.get(id) : undefined),
    };
  }, [properties]);

  return <PropertiesContext.Provider value={value}>{children}</PropertiesContext.Provider>;
}

function usePropertiesContext(): PropertiesContextValue {
  const ctx = useContext(PropertiesContext);
  if (!ctx) throw new Error("useProperties must be used within PropertiesProvider");
  return ctx;
}

/** The full published catalog. */
export function useProperties(): Property[] {
  return usePropertiesContext().properties;
}

/** Stable slug → Property lookup (replaces the old module-level getPropertyById). */
export function usePropertyLookup(): (id: string | undefined) => Property | undefined {
  return usePropertiesContext().getPropertyById;
}
