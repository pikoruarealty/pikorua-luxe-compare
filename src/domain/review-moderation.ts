export type DeterministicModerationCode =
  | "price_or_rate"
  | "contact_details"
  | "url_or_solicitation"
  | "unsafe_markup"
  | "repetition_or_spam";

export interface DeterministicModerationResult {
  accepted: boolean;
  codes: DeterministicModerationCode[];
  revision: "deterministic-v1";
}

const PRICE =
  /(?:₹|rs\.?|inr)\s*\d|\d[\d,.]*\s*(?:lakh|lac|crore|cr\b)|(?:price|rate)\s*(?:is|at|[:=-])\s*\d/i;
const CONTACT = /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i;
const URL_OR_SOLICITATION =
  /(?:https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|in|net|org)\b|\b(?:call|whatsapp|contact|dm me|message me)\b)/i;
const UNSAFE_MARKUP = /<\/?[a-z][^>]*>|javascript:|\bon\w+\s*=/i;

function looksRepetitive(value: string) {
  if (/(.)\1{7,}/u.test(value)) return true;
  const words = value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  if (words.length < 8) return false;
  const counts = new Map<string, number>();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  return [...counts.values()].some((count) => count / words.length >= 0.6);
}

export function moderateUserText(value: string | null | undefined): DeterministicModerationResult {
  const text = value?.trim() ?? "";
  const codes: DeterministicModerationCode[] = [];
  if (PRICE.test(text)) codes.push("price_or_rate");
  if (CONTACT.test(text)) codes.push("contact_details");
  if (URL_OR_SOLICITATION.test(text)) codes.push("url_or_solicitation");
  if (UNSAFE_MARKUP.test(text)) codes.push("unsafe_markup");
  if (looksRepetitive(text)) codes.push("repetition_or_spam");
  return { accepted: codes.length === 0, codes, revision: "deterministic-v1" };
}
