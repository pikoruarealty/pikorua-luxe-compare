const KEY = "pikorua:recently-viewed";
const MAX = 6;

export function recordView(id: string): void {
  try {
    const list = getRecentlyViewed();
    const next = [id, ...list.filter((x) => x !== id)].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable — recently-viewed is best-effort
  }
}

export function getRecentlyViewed(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
