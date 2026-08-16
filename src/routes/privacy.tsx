import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/LegalPage";

export const Route = createFileRoute("/privacy")({ component: PrivacyPage });

function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacy"
      title="How PropCompare handles your data"
      intro="PropCompare separates public property facts, private commercial data and customer information. This notice describes the controls implemented in the product; it must receive Indian legal review before public launch."
      sections={[
        {
          title: "Information we use",
          paragraphs: [
            "A consumer account is backed by a verified phone number. Name is required; email and profession are optional. Preferences, saves, reviews, enquiries and saved locations are associated with the account only when needed for those features.",
            "Exact developer prices, rates and internally calculated bounds are restricted commercial data. They are not included in consumer pages, browser payloads, analytics or share links.",
          ],
        },
        {
          title: "Enquiries and developers",
          paragraphs: [
            "Each price enquiry requires explicit consent. The owning developer receives only your name, verified phone, property, selected configuration and optional message. Budget, email, profession and activity history are not shared.",
            "Developers cannot access saved locations or behavioral analytics and can see enquiries only for their own properties.",
          ],
        },
        {
          title: "Analytics and retention",
          paragraphs: [
            "Optional product analytics can include market, configuration and budget-band choices under an internal identifier. You can opt out in Account settings; opting out removes retained identifiable product activity. Essential security and audit records remain separate.",
            "Source brochures and evidence are retained privately by default for verification and dispute handling, subject to owner-only legal hold and purge controls. Raw product events are designed for 90-day retention and non-identifying daily aggregates for 24 months.",
          ],
        },
        {
          title: "Your choices and contact",
          paragraphs: [
            "Account settings provide correction, analytics opt-out and permanent deletion. Deletion removes profile data, preferences, saves, locations and enquiry contact data; published reviews remain as “Former user” with personal linkage removed.",
            "For access, correction or grievance requests, use the PropCompare contact channel shown in the site footer and identify the request as a privacy matter. The production launch checklist requires the owner to record the designated grievance contact and legal review outcome.",
          ],
        },
        {
          title: "Google Maps data",
          paragraphs: [
            "When location comparison is enabled, PropCompare stores your own label and a Google Place ID. Google-returned coordinates and formatted provider content are re-fetched for use and are not retained beyond permitted caching. Google Maps attribution and provider terms apply.",
          ],
        },
      ]}
    />
  );
}
