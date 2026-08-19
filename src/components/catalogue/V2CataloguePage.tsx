import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Check, GitCompareArrows, MapPin, Star } from "lucide-react";
import { toast } from "sonner";

import { getRecommendations } from "@/api/functions/recommendations.functions";
import { saveConfirmedPreferences } from "@/api/functions/preferences-v2.functions";
import type {
  CatalogueMarket,
  RecommendationItem,
  RecommendationRequest,
} from "@/contracts/consumer";
import { BUDGET_BANDS, SELECTABLE_BUDGET_BANDS } from "@/domain/budget";
import {
  CATALOGUE_PREFERENCES_STORAGE_KEY,
  type StoredCataloguePreference,
} from "@/lib/preferences-storage";
import { useCompareStore } from "@/stores/compare-store";
import { useOnboarding } from "@/context/OnboardingContext";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { useActivityLog } from "@/hooks/use-activity-log";

const SESSION_KEY = "propcompare:v2-preferences-confirmed";

type Sort = "recommended" | "rating" | "possession";

export function V2CataloguePage({ markets }: { markets: CatalogueMarket[] }) {
  const { userProfile } = useOnboarding();
  const [step, setStep] = useState(1);
  const [stateCode, setStateCode] = useState("");
  const [marketId, setMarketId] = useState("");
  const [configurationIds, setConfigurationIds] = useState<string[]>([]);
  const [broadBudget, setBroadBudget] = useState("");
  const [budgetBandId, setBudgetBandId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<Sort>("recommended");
  const [propertyTypes, setPropertyTypes] = useState<string[]>([]);
  const recommend = useServerFn(getRecommendations);
  const save = useServerFn(saveConfirmedPreferences);
  const logActivity = useActivityLog();
  const selectedCompare = useCompareStore((state) => state.selected);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CATALOGUE_PREFERENCES_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as StoredCataloguePreference;
      const market = markets.find((candidate) => candidate.id === saved.marketId);
      const band = BUDGET_BANDS.find((candidate) => candidate.id === saved.budgetBandId);
      if (!market || !band) return;
      setStateCode(market.stateCode);
      setMarketId(market.id);
      setConfigurationIds(
        saved.configurationOptionIds.filter((id) =>
          market.configurations.some((option) => option.id === id),
        ),
      );
      setBroadBudget(band.broadLabel);
      setBudgetBandId(band.id);
      if (sessionStorage.getItem(SESSION_KEY) === "true") setConfirmed(true);
    } catch {
      // Invalid local preferences are ignored and recollected.
    }
  }, [markets]);

  const market = markets.find((candidate) => candidate.id === marketId);
  const states = useMemo(
    () => [...new Map(markets.map((candidate) => [candidate.stateCode, candidate.stateName]))],
    [markets],
  );
  const cities = markets.filter((candidate) => candidate.stateCode === stateCode);
  const broadBands = [...new Set(SELECTABLE_BUDGET_BANDS.map((band) => band.broadLabel))];

  const request = useMemo<RecommendationRequest | null>(
    () =>
      marketId && configurationIds.length && budgetBandId
        ? {
            marketId,
            configurationOptionIds: configurationIds,
            budgetBandId,
            propertyTypeIds: propertyTypes as RecommendationRequest["propertyTypeIds"],
          }
        : null,
    [budgetBandId, configurationIds, marketId, propertyTypes],
  );

  useEffect(() => {
    if (!confirmed || !request) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    recommend({ data: request })
      .then((response) => !cancelled && setItems(response))
      .catch(
        (cause) =>
          !cancelled &&
          setError(cause instanceof Error ? cause.message : "Could not load recommendations."),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [confirmed, recommend, request]);

  const confirm = () => {
    if (!request) return;
    localStorage.setItem(CATALOGUE_PREFERENCES_STORAGE_KEY, JSON.stringify(request));
    sessionStorage.setItem(SESSION_KEY, "true");
    setConfirmed(true);
    logActivity("quiz_completed", null, {
      marketId: request.marketId,
      configurationOptionIds: request.configurationOptionIds,
      budgetBandId: request.budgetBandId,
      propertyTypeIds: request.propertyTypeIds ?? [],
    });
    if (userProfile) void save({ data: request }).catch(() => undefined);
  };

  const sorted = useMemo(() => {
    if (sort === "rating") {
      return [...items].sort(
        (a, b) => b.property.publishedReviewCount - a.property.publishedReviewCount,
      );
    }
    if (sort === "possession") {
      return [...items].sort((a, b) =>
        (a.property.possessionDate ?? "9999-12-31").localeCompare(
          b.property.possessionDate ?? "9999-12-31",
        ),
      );
    }
    return items;
  }, [items, sort]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main>
        <section className="border-b border-border pt-28 pb-12">
          <div className="container-lux">
            <p className="text-xs font-semibold tracking-[0.2em] text-champagne uppercase">
              Ahmedabad-first property decisions
            </p>
            <div className="mt-4 grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
              <div>
                <h1 className="font-display text-4xl font-extrabold leading-tight sm:text-5xl">
                  Compare what fits your life, with the commercial details kept private.
                </h1>
                <p className="mt-4 max-w-xl leading-7 text-muted-foreground">
                  Complete all four preferences to open a catalogue ranked against verified project
                  data. Exact prices and rates never enter your browser.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5 sm:p-7">
                <div className="mb-6 flex items-center gap-2" aria-label={`Step ${step} of 4`}>
                  {[1, 2, 3, 4].map((number) => (
                    <span
                      key={number}
                      className={`h-1.5 flex-1 rounded-full ${number <= step ? "bg-champagne" : "bg-muted"}`}
                    />
                  ))}
                </div>
                {step === 1 && (
                  <PreferenceStep
                    title="1. Choose a state"
                    description="Only enabled markets with approved inventory appear."
                  >
                    {states.map(([code, name]) => (
                      <Choice
                        key={code}
                        selected={stateCode === code}
                        onClick={() => {
                          setStateCode(code);
                          setMarketId("");
                        }}
                      >
                        {name}
                      </Choice>
                    ))}
                    <Continue disabled={!stateCode} onClick={() => setStep(2)} />
                  </PreferenceStep>
                )}
                {step === 2 && (
                  <PreferenceStep
                    title="2. Choose a city"
                    description="Configuration availability is specific to this city."
                  >
                    {cities.map((city) => (
                      <Choice
                        key={city.id}
                        selected={marketId === city.id}
                        onClick={() => {
                          setMarketId(city.id);
                          setConfigurationIds([]);
                        }}
                      >
                        {city.cityName}
                      </Choice>
                    ))}
                    <Continue disabled={!marketId} onClick={() => setStep(3)} />
                  </PreferenceStep>
                )}
                {step === 3 && (
                  <PreferenceStep
                    title="3. Select configurations"
                    description="Choose one or as many available options as you want."
                  >
                    {market?.configurations.map((option) => (
                      <Choice
                        key={option.id}
                        selected={configurationIds.includes(option.id)}
                        onClick={() =>
                          setConfigurationIds((current) =>
                            current.includes(option.id)
                              ? current.filter((id) => id !== option.id)
                              : [...current, option.id],
                          )
                        }
                      >
                        {option.displayName}
                      </Choice>
                    ))}
                    <Continue disabled={!configurationIds.length} onClick={() => setStep(4)} />
                  </PreferenceStep>
                )}
                {step === 4 && (
                  <PreferenceStep
                    title="4. Confirm your budget"
                    description="Choose the same broad range and narrower band used by PropCompare today."
                  >
                    <div className="w-full space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {broadBands.map((label) => (
                          <Choice
                            key={label}
                            selected={broadBudget === label}
                            onClick={() => {
                              setBroadBudget(label);
                              setBudgetBandId("");
                            }}
                          >
                            {label}
                          </Choice>
                        ))}
                      </div>
                      {broadBudget && (
                        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                          {SELECTABLE_BUDGET_BANDS.filter(
                            (band) => band.broadLabel === broadBudget,
                          ).map((band) => (
                            <Choice
                              key={band.id}
                              selected={budgetBandId === band.id}
                              onClick={() => setBudgetBandId(band.id)}
                            >
                              {band.label}
                            </Choice>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={!budgetBandId}
                      onClick={confirm}
                      className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-champagne px-6 text-sm font-semibold text-lux-black disabled:opacity-40"
                    >
                      Show my catalogue <ArrowRight className="h-4 w-4" />
                    </button>
                  </PreferenceStep>
                )}
              </div>
            </div>
          </div>
        </section>

        {confirmed && (
          <section className="container-lux py-12" aria-busy={loading}>
            <div className="flex flex-col justify-between gap-5 border-b border-border pb-6 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs tracking-[0.18em] text-champagne uppercase">
                  Personalized catalogue
                </p>
                <h2 className="mt-2 font-display text-3xl font-bold">
                  Projects ranked for your selected configurations
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  aria-label="Sort catalogue"
                  value={sort}
                  onChange={(event) => setSort(event.target.value as Sort)}
                  className="h-10 rounded-full border border-border bg-card px-4 text-sm"
                >
                  <option value="recommended">Recommended</option>
                  <option value="rating">Highest user rating</option>
                  <option value="possession">Earliest verified possession</option>
                </select>
                {["apartment", "villa", "bungalow", "plot"].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() =>
                      setPropertyTypes((current) =>
                        current.includes(type)
                          ? current.filter((value) => value !== type)
                          : [...current, type],
                      )
                    }
                    className={`h-10 rounded-full border px-4 text-sm capitalize ${propertyTypes.includes(type) ? "border-champagne bg-champagne/10" : "border-border"}`}
                  >
                    {type}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setConfirmed(false);
                    setStep(1);
                  }}
                  className="h-10 rounded-full border border-border px-4 text-sm"
                >
                  Edit preferences
                </button>
              </div>
            </div>
            {loading && (
              <p className="py-16 text-center text-muted-foreground" role="status">
                Matching verified projects…
              </p>
            )}
            {error && (
              <p
                className="my-8 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300"
                role="alert"
              >
                {error}
              </p>
            )}
            {!loading && !error && !sorted.length && (
              <p className="py-16 text-center text-muted-foreground">
                No approved projects match this market yet. We will not fill the gap with
                placeholder inventory.
              </p>
            )}
            <div className="divide-y divide-border">
              {sorted.map((item) => (
                <RecommendationRow key={item.property.id} item={item} />
              ))}
            </div>
          </section>
        )}
      </main>
      {selectedCompare.length > 0 && (
        <aside className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-[min(92vw,42rem)] items-center justify-between gap-4 rounded-2xl border border-champagne/40 bg-lux-black/95 px-5 py-4 shadow-2xl backdrop-blur">
          <div>
            <p className="text-sm font-semibold text-ivory">
              {selectedCompare.length} of 3 projects selected
            </p>
            <p className="text-xs text-muted-foreground">
              {selectedCompare.length < 2
                ? "Select one more project to compare."
                : "Your selection stays saved through sign-in."}
            </p>
          </div>
          {selectedCompare.length >= 2 && (
            <Link
              to="/compare"
              search={{ ids: selectedCompare.join(","), shared: false }}
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-champagne px-5 text-sm font-semibold text-lux-black"
            >
              Compare <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </aside>
      )}
      <SiteFooter />
    </div>
  );
}

function PreferenceStep({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">Step</p>
      <h2 className="mt-2 font-display text-2xl font-bold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      <div className="mt-5 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm transition ${selected ? "border-champagne bg-champagne/10 text-champagne" : "border-border hover:border-foreground/40"}`}
    >
      {selected && <Check className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}
function Continue({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <div className="mt-4 w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="inline-flex h-11 items-center gap-2 rounded-full bg-champagne px-6 text-sm font-semibold text-lux-black disabled:opacity-40"
      >
        Continue <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function RecommendationRow({ item }: { item: RecommendationItem }) {
  const { toggle, isSelected } = useCompareStore();
  const selected = isSelected(item.property.slug);
  const fitLabel =
    item.fit === "within"
      ? "Matches selected budget"
      : item.fit === "slightly_above"
        ? "Slightly above selected budget"
        : item.fit === "well_above"
          ? "Well above selected budget"
          : item.fit === "slightly_below"
            ? "Slightly below selected budget"
            : item.fit === "well_below"
              ? "Well below selected budget"
              : "Commercial fit unavailable";
  return (
    <article className="grid gap-5 py-7 sm:grid-cols-[220px_1fr_auto] sm:items-center">
      <div className="aspect-[4/3] overflow-hidden rounded-xl bg-muted">
        {item.property.heroImageUrl ? (
          <img
            src={item.property.heroImageUrl}
            alt={item.property.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Approved media pending
          </div>
        )}
      </div>
      <div>
        <p className="text-xs tracking-[0.16em] text-champagne uppercase">
          {item.configurations.find(
            (configuration) => configuration.id === item.primaryConfigurationId,
          )?.displayName ?? "Other configurations"}
        </p>
        <h3 className="mt-2 font-display text-2xl font-bold">{item.property.name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {item.property.developerName ?? "Developer not stated"}
        </p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-4 w-4" />
            {item.property.locality ?? item.property.cityName}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Star className="h-4 w-4" />{" "}
            {item.property.publishedReviewCount
              ? `${item.property.publishedReviewCount} structured reviews`
              : "No reviews yet"}
          </span>
          <span className="font-semibold">Price on request</span>
        </div>
        <p className="mt-3 text-sm">
          <span className="font-semibold">{fitLabel}</span>
          {item.commercialDataStale &&
            ` · Pricing last verified ${new Date(item.verificationDate).toLocaleDateString("en-IN")}`}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Verified by PropCompare · {new Date(item.verificationDate).toLocaleDateString("en-IN")}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => {
            const result = toggle(item.property.slug);
            if (!result.ok) toast.error(result.reason);
          }}
          className={`inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold ${selected ? "bg-champagne text-lux-black" : "border border-champagne text-champagne"}`}
        >
          <GitCompareArrows className="h-4 w-4" />
          {selected ? "Added" : "Add to compare"}
        </button>
        <Link
          to="/residence/$id"
          params={{ id: item.property.slug }}
          className="text-center text-sm text-muted-foreground hover:text-foreground"
        >
          View public details
        </Link>
      </div>
    </article>
  );
}
