/** Log diagnostic detail server-side while returning a stable message that
 * cannot expose table, column, policy, or constraint names to a caller. */
export function throwSafeError(operation: string, error: unknown, publicMessage: string): never {
  console.error(`[${operation}]`, error);
  throw new Error(publicMessage);
}
