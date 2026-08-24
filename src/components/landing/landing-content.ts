/**
 * Landing page copy.
 *
 * Written for a buyer, not for an engineer. How the data is produced —
 * extraction, validation, RERA cross-referencing, the CI boundary checks — is
 * deliberately absent: it answers a question nobody is asking in their first
 * five seconds on the page.
 *
 * No invented statistics. Positioning is India-wide; specific counts of cities
 * or properties are not claimed, because a published number has to be
 * traceable to something real.
 */

export const HERO = {
  eyebrow: "Homes across India",
  /** "home" is set in gold italic — the one word the product is about. */
  headlineLead: "India's smartest way",
  headlineMid: "to choose a",
  headlineAccent: "home",
  standfirst: "You'll live here for ten years. Give it more than ten browser tabs.",
  primaryCta: "Find my home",
} as const;

/** Framing for the requirements form, which sits directly beneath the hero. */
export const PREFERENCES = {
  eyebrow: "Your requirements",
  headline: "Tell us what",
  headlineEmphasis: "you want.",
  body: "Four quick answers. Then we line up the homes that fit — yours to filter, compare and decide.",
} as const;
