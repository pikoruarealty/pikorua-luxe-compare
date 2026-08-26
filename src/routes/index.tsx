import { createFileRoute } from "@tanstack/react-router";
import { getCatalogueBootstrap } from "@/api/functions/catalogue-bootstrap.functions";
import { V2CataloguePage } from "@/components/catalogue/V2CataloguePage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PropCompare — Compare. Decide. Confidently." },
      {
        name: "description",
        content:
          "Compare ultra-luxury residences side by side and decide with clarity — configurations, pricing, RERA and possession, all in one view.",
      },
      { property: "og:title", content: "PropCompare — Compare. Decide. Confidently." },
      {
        property: "og:description",
        content: "Compare ultra-luxury residences side by side and decide with clarity.",
      },
    ],
  }),
  loader: async () => ({ v2: await getCatalogueBootstrap() }),
  component: Index,
});

function Index() {
  const { v2 } = Route.useLoaderData();
  return <V2CataloguePage markets={v2.markets} />;
}
