import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/LegalPage";

export const Route = createFileRoute("/methodology/developer-intelligence")({
  head: () => ({
    meta: [
      { title: "Developer intelligence policy — PropCompare" },
      {
        name: "description",
        content:
          "How PropCompare aggregates developer intelligence while protecting buyer privacy and ranking independence.",
      },
    ],
  }),
  component: DeveloperIntelligenceMethodology,
});

function DeveloperIntelligenceMethodology() {
  return (
    <LegalPage
      eyebrow="Methodology · developer intelligence"
      title="Aggregate insight, independent ranking"
      intro="Developer intelligence reports how projects are compared and reviewed. It does not sell placement, scores, verification outcomes or access to individual buyer histories."
      lastUpdated="21 August 2026"
      sections={[
        {
          title: "What is measured",
          paragraphs: [
            "Comparison volume counts a repeated project set only once per anonymous or signed-in actor per calendar day. Common comparison partners, explicit decision reasons and buyer-band positioning use the same rolling 30-day window and compare it with the preceding 30 days.",
            "Chosen and rejected reasons come only from optional structured buyer feedback. PropCompare does not infer a reason from clicks, time on page, weighting controls or review text.",
          ],
        },
        {
          title: "Privacy by threshold",
          paragraphs: [
            "No behavioural breakdown appears until at least five unique actor-day sessions qualify. Competitors and decision reasons also need five qualifying observations. Structured sentiment needs five distinct published reviews for each dimension.",
            "Developers receive aggregates only. Names, phone numbers, profile identifiers, anonymous browser identifiers, free-text feedback and raw event rows are never included in the dashboard response.",
          ],
        },
        {
          title: "Sentiment and limitations",
          paragraphs: [
            "Sentiment uses the structured dimensions a reviewer marked as experienced: sales experience, carpet area versus promise, construction, density, noise, approach and negotiation. It does not run automated sentiment analysis over free text.",
            "These are directional research signals, not verified bookings, cancellations, sales or investment outcomes. Missing preferences stay missing and are never inferred.",
          ],
        },
        {
          title: "Commercial independence",
          paragraphs: [
            "A trial or paid intelligence entitlement cannot alter catalogue order, recommendations, PropScore, RERA verification, review moderation or field-verification findings. Ranking and scores are not for sale.",
            "Raw product events expire after 90 days. Dashboard reports use rolling 30-day aggregates and never expose data outside the developer’s own published projects.",
          ],
        },
      ]}
    />
  );
}
