import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Calculator, MapPinned, Plus, Save, Waypoints } from "lucide-react";
import { toast } from "sonner";

import {
  calculatePublicationPropScore,
  getVerificationCandidates,
  saveReraVerification,
} from "@/api/functions/propscore.functions";
import {
  refreshPublicationConnectivity,
  saveCuratedLandmark,
  searchCuratedLandmarks,
  verifyPublicationLocation,
} from "@/api/functions/connectivity-admin.functions";
import { AdminLayout } from "@/components/admin/AdminLayout";

export const Route = createFileRoute("/admin/verification")({ component: VerificationPage });

type Candidate = Awaited<ReturnType<typeof getVerificationCandidates>>[number];
type AreaDraft = {
  brochureValue: string;
  brochureUnit: "sq_ft" | "sq_m" | "sq_yd" | "gaj" | "acre";
  brochureRawText: string;
  reraValue: string;
  reraUnit: "sq_ft" | "sq_m" | "sq_yd" | "gaj" | "acre";
  reraRawText: string;
};

const inputClass = "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm";

function VerificationPage() {
  const queryClient = useQueryClient();
  const candidates = useQuery({
    queryKey: ["admin", "verification-candidates"],
    queryFn: () => getVerificationCandidates(),
    retry: false,
  });
  const [publicationId, setPublicationId] = useState("");
  const selected = candidates.data?.find((item) => item.publicationVersionId === publicationId);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceDocumentId, setSourceDocumentId] = useState("");
  const [officialPromoter, setOfficialPromoter] = useState("");
  const [publishedPromoter, setPublishedPromoter] = useState("");
  const [officialCompletion, setOfficialCompletion] = useState("");
  const [publishedCompletion, setPublishedCompletion] = useState("");
  const [status, setStatus] = useState<
    "matched" | "discrepancy" | "unavailable" | "invalid_registration"
  >("matched");
  const [notes, setNotes] = useState("");
  const [promoterMatchBasis, setPromoterMatchBasis] = useState<
    "exact" | "normalized" | "manual_override" | "unresolved"
  >("exact");
  const [promoterMatchReason, setPromoterMatchReason] = useState("");
  const [areaDrafts, setAreaDrafts] = useState<Record<string, AreaDraft>>({});
  const [projectPlaceId, setProjectPlaceId] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [landmarkSearch, setLandmarkSearch] = useState("");
  const [landmark, setLandmark] = useState({
    category: "airport",
    displayName: "",
    googlePlaceId: "",
    sortOrder: "0",
  });

  const mutationOptions = (success: string) => ({
    onSuccess: () => {
      toast.success(success);
      void queryClient.invalidateQueries({ queryKey: ["admin", "verification-candidates"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const save = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Choose a publication first");
      return saveReraVerification({
        data: {
          publicationVersionId: selected.publicationVersionId,
          registrationNumber: selected.reraRegistration ?? "Unavailable",
          ...(sourceUrl ? { sourceUrl } : {}),
          ...(sourceDocumentId ? { sourceDocumentId } : {}),
          checkedAt: new Date().toISOString(),
          status,
          ...(publishedPromoter ? { publishedPromoterName: publishedPromoter } : {}),
          ...(officialPromoter ? { officialPromoterName: officialPromoter } : {}),
          promoterMatchBasis:
            publishedPromoter && officialPromoter ? promoterMatchBasis : undefined,
          ...(promoterMatchReason ? { promoterMatchReason } : {}),
          ...(publishedCompletion ? { publishedCompletionDate: publishedCompletion } : {}),
          ...(officialCompletion ? { officialCompletionDate: officialCompletion } : {}),
          ...(notes ? { notes } : {}),
          areas: selected.configurations.flatMap((configuration) => {
            const draft = areaDrafts[configuration.id];
            const brochureValue = Number(draft?.brochureValue);
            const reraValue = Number(draft?.reraValue);
            return Number.isFinite(brochureValue) && Number.isFinite(reraValue)
              ? [
                  {
                    configurationVariantId: configuration.id,
                    brochureValue,
                    brochureUnit: draft.brochureUnit,
                    brochureRawText: draft.brochureRawText || `${brochureValue} sq ft`,
                    reraValue,
                    reraUnit: draft.reraUnit,
                    reraRawText: draft.reraRawText || `${reraValue} sq ft`,
                  },
                ]
              : [];
          }),
        },
      });
    },
    ...mutationOptions("RERA verification saved"),
  });
  const score = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Choose a publication first");
      return calculatePublicationPropScore({
        data: { publicationVersionId: selected.publicationVersionId },
      });
    },
    ...mutationOptions("PropScore calculated"),
  });
  const verifyLocation = useMutation({
    mutationFn: () => {
      if (!selected || !projectPlaceId.trim())
        throw new Error("Choose a publication and enter its Google Place ID");
      return verifyPublicationLocation({
        data: {
          publicationVersionId: selected.publicationVersionId,
          googlePlaceId: projectPlaceId.trim(),
        },
      });
    },
    ...mutationOptions("Project location verified"),
  });
  const refresh = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Choose a publication first");
      return refreshPublicationConnectivity({
        data: { publicationVersionId: selected.publicationVersionId },
      });
    },
    ...mutationOptions("Connectivity snapshots refreshed"),
  });
  const addLandmark = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Choose a publication to identify its market");
      return saveCuratedLandmark({
        data: {
          marketId: selected.marketId,
          category: landmark.category as "airport",
          displayName: landmark.displayName,
          googlePlaceId: landmark.googlePlaceId,
          sortOrder: Number(landmark.sortOrder),
        },
      });
    },
    ...mutationOptions("Market landmark saved"),
  });
  const projectPlaceSearch = useMutation({
    mutationFn: () => searchCuratedLandmarks({ data: { query: projectSearch } }),
    onError: (error: Error) => toast.error(error.message),
  });
  const landmarkPlaceSearch = useMutation({
    mutationFn: () => searchCuratedLandmarks({ data: { query: landmarkSearch } }),
    onError: (error: Error) => toast.error(error.message),
  });
  const busy = save.isPending || score.isPending || verifyLocation.isPending || refresh.isPending;
  const configRows = useMemo(() => selected?.configurations ?? [], [selected]);

  return (
    <AdminLayout title="Verification & PropScore" requireReviewer>
      <div className="space-y-8">
        <section className="rounded-2xl border border-border bg-card p-6">
          <h1 className="font-display text-3xl font-bold">Phase 5 reviewer console</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Record official RERA evidence, calculate an immutable PropScore and snapshot curated
            connectivity. Nothing here is developer-editable.
          </p>
          <label className="mt-6 block text-xs tracking-[0.14em] text-muted-foreground uppercase">
            Current publication
            <select
              className={`${inputClass} mt-2`}
              value={publicationId}
              onChange={(event) => setPublicationId(event.target.value)}
            >
              <option value="">Choose a project</option>
              {(candidates.data ?? []).map((candidate) => (
                <option key={candidate.publicationVersionId} value={candidate.publicationVersionId}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </label>
        </section>

        {selected && (
          <>
            <section className="rounded-2xl border border-border bg-card p-6">
              <h2 className="font-display text-2xl font-bold">RERA cross-check</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Official source URL" value={sourceUrl} onChange={setSourceUrl} />
                <Field
                  label="Official source document UUID"
                  value={sourceDocumentId}
                  onChange={setSourceDocumentId}
                />
                <SelectField
                  label="Result"
                  value={status}
                  onChange={(value) => setStatus(value as typeof status)}
                  options={["matched", "discrepancy", "unavailable", "invalid_registration"]}
                />
                <Field
                  label="Published promoter"
                  value={publishedPromoter}
                  onChange={setPublishedPromoter}
                />
                <Field
                  label="Official promoter"
                  value={officialPromoter}
                  onChange={setOfficialPromoter}
                />
                <Field
                  label="Published completion"
                  value={publishedCompletion}
                  onChange={setPublishedCompletion}
                  type="date"
                />
                <Field
                  label="Official completion"
                  value={officialCompletion}
                  onChange={setOfficialCompletion}
                  type="date"
                />
                <SelectField
                  label="Promoter match basis"
                  value={promoterMatchBasis}
                  onChange={(value) => setPromoterMatchBasis(value as typeof promoterMatchBasis)}
                  options={["exact", "normalized", "manual_override", "unresolved"]}
                />
                <Field
                  label="Promoter match reason"
                  value={promoterMatchReason}
                  onChange={setPromoterMatchReason}
                />
              </div>
              {configRows.length > 0 && (
                <div className="mt-6 space-y-4">
                  <h3 className="text-sm font-semibold">Registered carpet-area checks (sq ft)</h3>
                  {configRows.map((configuration) => {
                    const draft = areaDrafts[configuration.id] ?? {
                      brochureValue: "",
                      brochureUnit: "sq_ft",
                      brochureRawText: "",
                      reraValue: "",
                      reraUnit: "sq_ft",
                      reraRawText: "",
                    };
                    return (
                      <div
                        key={configuration.id}
                        className="grid gap-3 rounded-xl border border-border p-4 md:grid-cols-3"
                      >
                        <p className="text-sm font-semibold">{configuration.label}</p>
                        <AreaEvidence
                          label="Brochure"
                          draft={draft}
                          side="brochure"
                          onChange={(next) =>
                            setAreaDrafts((current) => ({ ...current, [configuration.id]: next }))
                          }
                        />
                        <AreaEvidence
                          label="RERA"
                          draft={draft}
                          side="rera"
                          onChange={(next) =>
                            setAreaDrafts((current) => ({ ...current, [configuration.id]: next }))
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              )}
              <label className="mt-5 block text-xs tracking-[0.14em] text-muted-foreground uppercase">
                Reviewer notes
                <textarea
                  className="mt-2 min-h-24 w-full rounded-lg border border-border bg-background p-3 text-sm normal-case tracking-normal"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>
              <div className="mt-5 flex flex-wrap gap-3">
                <Action
                  icon={Save}
                  label="Save verification"
                  disabled={busy}
                  onClick={() => save.mutate()}
                />
                <Action
                  icon={Calculator}
                  label="Calculate PropScore"
                  disabled={busy}
                  onClick={() => score.mutate()}
                />
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-6">
              <h2 className="font-display text-2xl font-bold">Curated connectivity</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <PlacePicker
                  label="Find project location"
                  query={projectSearch}
                  setQuery={setProjectSearch}
                  results={projectPlaceSearch.data ?? []}
                  onSearch={() => projectPlaceSearch.mutate()}
                  onSelect={(place) => {
                    setProjectPlaceId(place.placeId);
                    setProjectSearch(place.label);
                  }}
                />
                <div className="flex items-end gap-3">
                  <Action
                    icon={MapPinned}
                    label="Verify project location"
                    disabled={busy}
                    onClick={() => verifyLocation.mutate()}
                  />
                  <Action
                    icon={Waypoints}
                    label="Refresh routes"
                    disabled={busy}
                    onClick={() => refresh.mutate()}
                  />
                </div>
              </div>
              <div className="mt-8 grid gap-4 md:grid-cols-4">
                <SelectField
                  label="Landmark category"
                  value={landmark.category}
                  onChange={(value) => setLandmark((current) => ({ ...current, category: value }))}
                  options={[
                    "airport",
                    "transit",
                    "business_district",
                    "hospital",
                    "school",
                    "shopping",
                    "highway_access",
                  ]}
                />
                <div className="md:col-span-2">
                  <PlacePicker
                    label="Find curated landmark"
                    query={landmarkSearch}
                    setQuery={setLandmarkSearch}
                    results={landmarkPlaceSearch.data ?? []}
                    onSearch={() => landmarkPlaceSearch.mutate()}
                    onSelect={(place) => {
                      setLandmark((current) => ({
                        ...current,
                        displayName: place.label,
                        googlePlaceId: place.placeId,
                      }));
                      setLandmarkSearch(place.label);
                    }}
                  />
                </div>
                <div className="flex items-end">
                  <Action
                    icon={Plus}
                    label="Save landmark"
                    disabled={addLandmark.isPending}
                    onClick={() => addLandmark.mutate()}
                  />
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-xs tracking-[0.14em] text-muted-foreground uppercase">
      {label}
      <input
        className={`${inputClass} mt-2 normal-case tracking-normal`}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="block text-xs tracking-[0.14em] text-muted-foreground uppercase">
      {label}
      <select
        className={`${inputClass} mt-2 normal-case tracking-normal`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option.replaceAll("_", " ")}
          </option>
        ))}
      </select>
    </label>
  );
}
function Action({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: typeof Save;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-champagne px-5 text-xs font-semibold text-lux-black disabled:opacity-40"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function AreaEvidence({
  label,
  draft,
  side,
  onChange,
}: {
  label: string;
  draft: AreaDraft;
  side: "brochure" | "rera";
  onChange: (draft: AreaDraft) => void;
}) {
  const valueKey = `${side}Value` as "brochureValue" | "reraValue";
  const unitKey = `${side}Unit` as "brochureUnit" | "reraUnit";
  const rawKey = `${side}RawText` as "brochureRawText" | "reraRawText";
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="grid grid-cols-[1fr_0.8fr] gap-2">
        <input
          className={inputClass}
          type="number"
          min="0"
          placeholder="Value"
          value={draft[valueKey]}
          onChange={(event) => onChange({ ...draft, [valueKey]: event.target.value })}
        />
        <select
          className={inputClass}
          value={draft[unitKey]}
          onChange={(event) =>
            onChange({ ...draft, [unitKey]: event.target.value as AreaDraft[typeof unitKey] })
          }
        >
          {["sq_ft", "sq_m", "sq_yd", "gaj", "acre"].map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>
      </div>
      <input
        className={inputClass}
        placeholder="Printed text, exactly as shown"
        value={draft[rawKey]}
        onChange={(event) => onChange({ ...draft, [rawKey]: event.target.value })}
      />
    </div>
  );
}

function PlacePicker({
  label,
  query,
  setQuery,
  results,
  onSearch,
  onSelect,
}: {
  label: string;
  query: string;
  setQuery: (value: string) => void;
  results: Array<{ label: string; placeId: string }>;
  onSearch: () => void;
  onSelect: (place: { label: string; placeId: string }) => void;
}) {
  return (
    <div>
      <label className="block text-xs tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </label>
      <div className="mt-2 flex gap-2">
        <input
          className={inputClass}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          type="button"
          onClick={onSearch}
          className="rounded-lg border border-border px-4 text-xs"
        >
          Search
        </button>
      </div>
      {results.length > 0 && (
        <div className="mt-2 overflow-hidden rounded-lg border border-border">
          {results.map((place) => (
            <button
              key={place.placeId}
              type="button"
              onClick={() => onSelect(place)}
              className="block w-full border-b border-border px-3 py-2 text-left text-xs last:border-0 hover:bg-foreground/5"
            >
              {place.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
