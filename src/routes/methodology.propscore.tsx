import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/legal/LegalPage";

export const Route = createFileRoute("/methodology/propscore")({
  head: () => ({
    meta: [
      { title: "PropScore Methodology — PropCompare" },
      {
        name: "description",
        content: "The permanent, source-backed methodology for PropCompare's five-part PropScore.",
      },
    ],
  }),
  component: PropScoreMethodology,
});

function PropScoreMethodology() {
  return (
    <LegalPage
      eyebrow="Methodology · propscore-v1.0.0"
      title="How PropScore works"
      intro="PropScore is a comparison aid built only from verified, source-backed property facts. It is not a valuation, investment recommendation or substitute for legal and technical due diligence."
      lastUpdated="17 August 2026"
      sections={[
        {
          title: "Five equally weighted dimensions",
          paragraphs: [
            "Space, Privacy/Density, Specification, Developer and Possession each contribute 20% to the overall score. Every dimension and the composite are whole numbers from 0 to 100.",
            "The overall score is withheld unless all five dimensions have sufficient verified evidence. Missing or not-stated information is never turned into zero and is never inferred.",
          ],
        },
        {
          title: "Cohorts and calculations",
          paragraphs: [
            "Metrics without an objective fixed threshold use percentile rank among at least eight verified observations in the same market, property type and, where applicable, configuration. If that cohort is too small, the calculation falls back to the same market and property type; otherwise the metric remains unavailable.",
            "Space uses RERA carpet efficiency and matched-configuration RERA carpet area. Privacy uses density, lift adequacy, open space and clubhouse area per home. Specification uses canonical, source-backed specification codes. Developer uses delivery ratio and experience. Possession measures agreement and freshness of brochure and RERA evidence, not how soon possession occurs.",
          ],
        },
        {
          title: "RERA evidence and disagreements",
          paragraphs: [
            "A PropCompare reviewer manually checks the official registration source, promoter identity, declared completion date and registered carpet areas. Automatic RERA scraping is not used in this methodology.",
            "Carpet-area differences within 1% are treated as rounding-equivalent. Larger disagreements remain visible with both attributed values; they are never averaged or silently overwritten. An unresolved registration identity mismatch blocks affected scores.",
          ],
        },
        {
          title: "Connectivity",
          paragraphs: [
            "Connectivity is shown separately and never changes PropScore. PropCompare curates a small market-specific set of landmarks and stores a dated driving-distance and travel-time snapshot. Consumer page requests do not run live landmark searches or route calculations.",
          ],
        },
        {
          title: "Independence and versioning",
          paragraphs: [
            "Price, basic rate, review ratings, enquiry volume, sponsorship and developer payments never enter PropScore. Scores and ranking cannot be purchased, edited by developers or removed on request.",
            "Every result records its methodology version, evidence date and cohort snapshot. A formula change requires a new published methodology version and creates a new immutable score record.",
          ],
        },
      ]}
    />
  );
}
