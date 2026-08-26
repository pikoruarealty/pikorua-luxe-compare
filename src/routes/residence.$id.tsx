import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getV2PublicPropertyDetail } from "@/api/functions/public-detail.functions";
import { V2ResidenceDetail } from "@/components/residence/V2ResidenceDetail";

export const Route = createFileRoute("/residence/$id")({
  loader: async ({ params }) => ({
    detail: await getV2PublicPropertyDetail({ data: { slug: params.id } }),
  }),
  head: () => ({
    meta: [
      { title: "Residence — PropCompare" },
      {
        name: "description",
        content:
          "Explore this luxury residence in detail — gallery, floor plans, amenities and private advisory perspective.",
      },
    ],
  }),
  component: ResidencePage,
});

function ResidencePage() {
  const { detail } = Route.useLoaderData();
  if (!detail) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-6 text-center">
          <p className="tracking-luxury text-champagne text-xs font-semibold uppercase">
            Not found
          </p>
          <h1
            className="mt-4 font-display text-2xl sm:text-3xl font-bold text-foreground"
            style={{ letterSpacing: "var(--tracking-display)" }}
          >
            This residence isn't in our portfolio
          </h1>
          <Link
            to="/"
            className="tracking-luxury mt-8 inline-flex items-center gap-2 rounded-full gold-border px-6 py-3 text-champagne hover:bg-champagne hover:text-lux-black text-xs font-semibold uppercase transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to the collection
          </Link>
        </div>
      </div>
    );
  }
  return <V2ResidenceDetail detail={detail} />;
}
