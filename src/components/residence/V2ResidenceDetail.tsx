import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, GitCompareArrows, MapPin, ShieldCheck, Star } from "lucide-react";

import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { useCompareStore } from "@/stores/compare-store";

type Detail = NonNullable<
  Awaited<
    ReturnType<
      (typeof import("@/api/functions/public-detail.functions"))["getV2PublicPropertyDetail"]
    >
  >
>;

export function V2ResidenceDetail({ detail }: { detail: Detail }) {
  const navigate = useNavigate();
  const { toggle, selected } = useCompareStore();
  const isSelected = selected.includes(detail.property.slug);
  const compare = () => {
    const result = isSelected ? { ok: true as const } : toggle(detail.property.slug);
    if (result.ok && selected.length + Number(!isSelected) >= 2) {
      const ids = isSelected ? selected : [...selected, detail.property.slug];
      void navigate({ to: "/compare", search: { ids: ids.join(","), shared: false } });
    }
  };
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main>
        <section className="border-b border-border pt-28 pb-10">
          <div className="container-lux grid gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-end">
            <div>
              <p className="text-xs tracking-[0.18em] text-champagne uppercase">
                {detail.property.propertyType}
              </p>
              <h1 className="mt-3 font-display text-5xl font-extrabold">{detail.property.name}</h1>
              <p className="mt-3 text-muted-foreground">
                {detail.property.developerName ?? "Developer not stated"}
              </p>
              <p className="mt-5 flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                {detail.addressLine ?? detail.property.locality ?? detail.property.cityName}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-sm font-semibold">Price on request</p>
              <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-champagne" /> Verified by PropCompare ·{" "}
                {new Date(detail.verificationDate).toLocaleDateString("en-IN")}
              </p>
              <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Star className="h-4 w-4" />
                {detail.property.ratingAverage
                  ? `${detail.property.ratingAverage.toFixed(1)} from ${detail.property.publishedReviewCount} reviews`
                  : "No published reviews yet"}
              </p>
              <button
                type="button"
                onClick={compare}
                className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-champagne text-sm font-semibold text-lux-black"
              >
                <GitCompareArrows className="h-4 w-4" />
                {selected.length >= 2
                  ? "Open comparison"
                  : isSelected
                    ? "Added to compare"
                    : "Add to compare"}
              </button>
            </div>
          </div>
        </section>
        <section className="container-lux py-12">
          <h2 className="font-display text-3xl font-bold">Approved configurations</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {detail.configurations.map((configuration) => (
              <article key={configuration.id} className="rounded-xl border border-border p-5">
                <h3 className="font-display text-xl font-bold">{configuration.displayName}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {configuration.variantName ?? "Standard approved variant"}
                </p>
                <p className="mt-5 text-sm">
                  {configuration.areaValue !== null
                    ? `${configuration.areaValue} ${unit(configuration.areaUnit)} · ${basis(configuration.areaBasis)}`
                    : "Area not stated"}
                </p>
                <p className="mt-2 text-sm font-semibold">Price on request</p>
              </article>
            ))}
          </div>
          <div className="mt-12 grid gap-8 lg:grid-cols-2">
            <FactualList
              title="Amenities"
              values={detail.amenities.map((item) => ({
                label: item.name,
                value:
                  item.state === "stated"
                    ? (item.details ?? "Stated in approved source")
                    : stateLabel(item.state),
              }))}
            />
            <FactualList
              title="Specifications"
              values={detail.specifications.map((item) => ({
                label: item.name,
                value:
                  item.state === "stated" ? (item.value ?? "Not stated") : stateLabel(item.state),
              }))}
            />
          </div>
          <Link
            to="/"
            className="mt-12 inline-flex items-center gap-2 text-sm text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to catalogue
          </Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function FactualList({
  title,
  values,
}: {
  title: string;
  values: Array<{ label: string; value: string }>;
}) {
  return (
    <section>
      <h2 className="font-display text-2xl font-bold">{title}</h2>
      {values.length ? (
        <dl className="mt-5 divide-y divide-border border-y border-border">
          {values.map((item) => (
            <div key={item.label} className="grid grid-cols-2 gap-4 py-3 text-sm">
              <dt className="text-muted-foreground">{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">Not stated</p>
      )}
    </section>
  );
}
function stateLabel(state: string) {
  return state === "explicitly_not_offered"
    ? "Not offered"
    : state === "not_applicable"
      ? "Not applicable"
      : state === "pending_review"
        ? "Pending review"
        : "Not stated";
}
function unit(value: string | null) {
  return value === "sq_ft" ? "sq ft" : value === "sq_m" ? "sq m" : value === "sq_yd" ? "sq yd" : "";
}
function basis(value: string | null) {
  return value ? value.replaceAll("_", " ") : "basis not stated";
}
