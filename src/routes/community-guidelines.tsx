import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/LegalPage";

export const Route = createFileRoute("/community-guidelines")({ component: GuidelinesPage });
function GuidelinesPage() {
  return (
    <LegalPage
      eyebrow="Community"
      title="Review guidelines"
      intro="Helpful reviews are specific, first-hand and safe to publish. Every reviewer has a verified phone account, while public identity is limited to first name and a phone-verified label."
      sections={[
        {
          title: "What belongs",
          paragraphs: [
            "Describe your visit, the information you received, accessibility, site experience or source-backed project facts. Keep optional review text under 2,000 characters and choose an honest 1–5 rating.",
          ],
        },
        {
          title: "What is blocked",
          paragraphs: [
            "Do not publish exact prices or rates, phone numbers, email addresses, URLs, solicitation, unsafe markup, spam, threats, harassment or personal data. The same rules apply to developer responses and every edit is screened again.",
          ],
        },
        {
          title: "Reports and decisions",
          paragraphs: [
            "Use a fixed report reason when content appears unsafe, private, abusive, misleading or spam. Reports do not automatically hide a review. Reviewer, support and owner roles record a reasoned, audited decision and can restore content.",
          ],
        },
      ]}
    />
  );
}
