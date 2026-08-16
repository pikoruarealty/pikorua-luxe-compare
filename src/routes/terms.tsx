import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/LegalPage";

export const Route = createFileRoute("/terms")({ component: TermsPage });
function TermsPage() {
  return (
    <LegalPage
      eyebrow="Terms"
      title="Using PropCompare"
      intro="PropCompare is a property decision and comparison service. It is not a broker, lender, valuation service or substitute for legal, technical and financial due diligence."
      sections={[
        {
          title: "Property information",
          paragraphs: [
            "Verified by PropCompare means an internal reviewer approved a source-backed publication on the displayed date. It does not guarantee future availability, title, construction quality, price or legal compliance.",
            "Commercial data may continue to support matching after 90 days with an older-pricing notice. Price on request is an invitation to contact the owning developer, not a quoted offer.",
          ],
        },
        {
          title: "Accounts and acceptable use",
          paragraphs: [
            "You are responsible for access to your verified phone. Do not probe recommendation results to infer private commercial values, automate excessive requests, impersonate another person or misuse developer contact information.",
          ],
        },
        {
          title: "Reviews",
          paragraphs: [
            "Reviews must reflect genuine experience and follow the community guidelines. PropCompare may hold, hide or remove content and retains edit versions and moderation decisions for trust and safety.",
          ],
        },
        {
          title: "Launch requirement",
          paragraphs: [
            "These product terms are implementation-ready copy, not a substitute for counsel. Public launch remains blocked until the owner records formal legal approval for DPDP, moderation, verification language, enquiries and document retention.",
          ],
        },
      ]}
    />
  );
}
