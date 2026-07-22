import { useEffect, useState } from "react";

/** Returns true once the component has mounted on the client.
 *  Use to gate rendering of state that comes from persisted/localStorage
 *  stores so SSR and first client render match. */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
