import { describe, expect, it } from "vitest";
import { moderateUserText } from "./review-moderation";

describe("deterministic review moderation", () => {
  it("accepts ordinary property feedback", () => {
    expect(
      moderateUserText("The lift lobby was clean and the visit was well organized.").accepted,
    ).toBe(true);
  });
  it.each([
    ["Quoted at ₹2.5 Cr", "price_or_rate"],
    ["Call me on 9876543210", "contact_details"],
    ["See https://example.com", "url_or_solicitation"],
    ["<script>alert(1)</script>", "unsafe_markup"],
  ] as const)("blocks %s", (text, code) => {
    expect(moderateUserText(text).codes).toContain(code);
  });
});
