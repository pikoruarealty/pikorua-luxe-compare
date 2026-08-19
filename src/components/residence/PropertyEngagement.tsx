import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Flag, MessageSquareText, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  confirmReviewVisitEvidence,
  createReviewVisitEvidenceTicket,
  deleteOwnReview,
  getOwnReview,
  getPublicFieldVerification,
  getPublicReviews,
  reportPublicReview,
  saveOwnReview,
  submitPriceEnquiry,
} from "@/api/functions/engagement.functions";
import { useOnboarding } from "@/context/OnboardingContext";
import {
  REVIEW_DIMENSIONS,
  REVIEW_DIMENSION_LABELS,
  type StructuredReviewDimension,
} from "@/domain/structured-reviews";

interface Props {
  slug: string;
  configurations: Array<{ id: string; displayName: string; variantName: string | null }>;
  reviewsEnabled: boolean;
  enquiriesEnabled: boolean;
}

export function PropertyEngagement(props: Props) {
  return (
    <div className="mt-16 grid gap-10 border-t border-border pt-12 lg:grid-cols-[1.2fr_0.8fr]">
      {props.reviewsEnabled ? <Reviews slug={props.slug} /> : <FeatureUnavailable name="Reviews" />}
      {props.enquiriesEnabled ? (
        <Enquiry slug={props.slug} configurations={props.configurations} />
      ) : (
        <FeatureUnavailable name="Price enquiries" />
      )}
    </div>
  );
}

function Reviews({ slug }: { slug: string }) {
  const { userProfile, requestAuth } = useOnboarding();
  const queryClient = useQueryClient();
  const save = useServerFn(saveOwnReview);
  const createEvidenceTicket = useServerFn(createReviewVisitEvidenceTicket);
  const confirmEvidence = useServerFn(confirmReviewVisitEvidence);
  const remove = useServerFn(deleteOwnReview);
  const report = useServerFn(reportPublicReview);
  const [dimensions, setDimensions] = useState<StructuredReviewDimension[]>(() =>
    REVIEW_DIMENSIONS.map((dimension) => ({
      dimension,
      experienceState: "not_experienced",
      rating: null,
      note: null,
    })),
  );
  const [visitDate, setVisitDate] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const reviewsQuery = useQuery({
    queryKey: ["public-reviews", slug],
    queryFn: () => getPublicReviews({ data: { slug } }),
  });
  const fieldVerificationQuery = useQuery({
    queryKey: ["field-verification", slug],
    queryFn: () => getPublicFieldVerification({ data: { slug } }),
  });
  const ownQuery = useQuery({
    queryKey: ["own-review", slug, userProfile?.uid],
    queryFn: () => getOwnReview({ data: { slug } }),
    enabled: Boolean(userProfile),
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["public-reviews", slug] }),
      queryClient.invalidateQueries({ queryKey: ["own-review", slug] }),
    ]);
  };
  const submit = async () => {
    if (!userProfile) return requestAuth();
    if (Boolean(evidenceFile) !== Boolean(visitDate)) {
      return toast.error("Add both a visit date and booking proof, or leave both blank.");
    }
    if (evidenceFile && evidenceFile.size > 10 * 1024 * 1024) {
      return toast.error("Visit proof must be 10 MB or smaller.");
    }
    setBusy(true);
    try {
      const result = await save({ data: { slug, dimensions } });
      if (evidenceFile && visitDate) {
        const digest = await crypto.subtle.digest("SHA-256", await evidenceFile.arrayBuffer());
        const sha256 = Array.from(new Uint8Array(digest))
          .map((value) => value.toString(16).padStart(2, "0"))
          .join("");
        const ticket = await createEvidenceTicket({
          data: {
            reviewId: result.id,
            visitDate,
            filename: evidenceFile.name,
            mimeType: evidenceFile.type as "application/pdf" | "image/jpeg" | "image/png",
            sizeBytes: evidenceFile.size,
            sha256,
          },
        });
        const upload = await fetch(ticket.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": evidenceFile.type, "x-goog-meta-sha256": sha256 },
          body: evidenceFile,
        });
        if (!upload.ok) throw new Error("Could not upload visit proof");
        await confirmEvidence({ data: { evidenceId: ticket.evidenceId } });
      }
      toast.success(ownQuery.data ? "Review updated" : "Review published");
      await refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not publish review");
    } finally {
      setBusy(false);
    }
  };
  const deleteReview = async () => {
    if (!ownQuery.data) return;
    setBusy(true);
    try {
      await remove({ data: { reviewId: ownQuery.data.id } });
      setDimensions(
        REVIEW_DIMENSIONS.map((dimension) => ({
          dimension,
          experienceState: "not_experienced",
          rating: null,
          note: null,
        })),
      );
      toast.success("Review deleted");
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-labelledby="reviews-title">
      <p className="text-xs tracking-[0.18em] text-champagne uppercase">
        Structured, phone-verified voices
      </p>
      <h2 id="reviews-title" className="mt-2 font-display text-3xl font-bold">
        Reviews
      </h2>
      <div className="mt-6 rounded-2xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">
          Rate only what you experienced first-hand. Prices, rates and contact details are not
          allowed.
        </p>
        <div className="mt-5 space-y-4">
          {dimensions.map((item, index) => (
            <fieldset key={item.dimension} className="rounded-xl border border-border p-3">
              <legend className="px-1 text-sm font-medium">
                {REVIEW_DIMENSION_LABELS[item.dimension]}
              </legend>
              <div className="flex flex-wrap gap-2 text-sm">
                <button
                  type="button"
                  onClick={() =>
                    setDimensions((current) =>
                      current.map((value, i) =>
                        i === index
                          ? { ...value, experienceState: "not_experienced", rating: null }
                          : value,
                      ),
                    )
                  }
                  className={`rounded-full border px-3 py-1 ${item.experienceState === "not_experienced" ? "border-champagne" : "border-border"}`}
                >
                  Not experienced
                </button>
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      userProfile
                        ? setDimensions((current) =>
                            current.map((entry, i) =>
                              i === index
                                ? { ...entry, experienceState: "experienced", rating: value }
                                : entry,
                            ),
                          )
                        : requestAuth()
                    }
                    className={`rounded-full border px-3 py-1 ${item.rating === value ? "border-champagne bg-champagne/10" : "border-border"}`}
                  >
                    {value}
                  </button>
                ))}
              </div>
              {item.experienceState === "experienced" && (
                <textarea
                  value={item.note ?? ""}
                  maxLength={1000}
                  onChange={(event) =>
                    setDimensions((current) =>
                      current.map((value, i) =>
                        i === index ? { ...value, note: event.target.value || null } : value,
                      ),
                    )
                  }
                  placeholder="Optional factual note"
                  className="mt-3 min-h-20 w-full rounded-lg border border-border bg-background p-2 text-sm"
                />
              )}
            </fieldset>
          ))}
        </div>
        <div className="mt-5 rounded-xl border border-border p-3">
          <p className="text-sm font-medium">Request visit-evidence verification (optional)</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload a booking or appointment proof. It is private, reviewed by staff, and deleted
            after 90 days.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input
              type="date"
              value={visitDate}
              onChange={(event) => setVisitDate(event.target.value)}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
            />
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={(event) => setEvidenceFile(event.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            Published as phone verified after safety checks.
          </span>
          <div className="flex gap-2">
            {ownQuery.data && (
              <button
                type="button"
                disabled={busy}
                onClick={deleteReview}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={submit}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-champagne px-5 text-sm font-semibold text-lux-black disabled:opacity-50"
            >
              <MessageSquareText className="h-4 w-4" />
              {ownQuery.data ? "Update review" : "Publish review"}
            </button>
          </div>
        </div>
      </div>
      <div className="mt-7 space-y-4" aria-live="polite">
        {fieldVerificationQuery.data && (
          <article className="rounded-2xl border border-champagne/40 bg-champagne/5 p-4">
            <p className="text-xs font-semibold tracking-wide text-champagne uppercase">
              PropCompare field verification
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Visited {fieldVerificationQuery.data.visitedOn}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {fieldVerificationQuery.data.observations.map((observation) => (
                <div key={observation.dimension} className="text-sm">
                  <span className="font-medium">
                    {
                      REVIEW_DIMENSION_LABELS[
                        observation.dimension as keyof typeof REVIEW_DIMENSION_LABELS
                      ]
                    }
                  </span>
                  <p className="text-muted-foreground">
                    {observation.observationState === "observed"
                      ? observation.observation
                      : "Not observed"}
                  </p>
                </div>
              ))}
            </div>
          </article>
        )}
        {reviewsQuery.isPending && (
          <p className="text-sm text-muted-foreground">Loading reviews…</p>
        )}
        {reviewsQuery.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">No published reviews yet.</p>
        )}
        {reviewsQuery.data?.map((review) => (
          <article key={review.id} className="border-b border-border pb-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold">{review.publicName}</p>
                <p className="text-xs text-muted-foreground">Structured review</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {review.verificationTier === "visit_evidence_reviewed"
                ? "Visit evidence reviewed"
                : "Phone verified"}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {review.dimensions
                .filter((dimension) => dimension.experienceState === "experienced")
                .map((dimension) => (
                  <div key={dimension.dimension} className="rounded-lg bg-muted/40 p-2 text-sm">
                    <span className="font-medium">
                      {
                        REVIEW_DIMENSION_LABELS[
                          dimension.dimension as keyof typeof REVIEW_DIMENSION_LABELS
                        ]
                      }
                      : {dimension.rating}/5
                    </span>
                    {dimension.note && (
                      <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                        {dimension.note}
                      </p>
                    )}
                  </div>
                ))}
            </div>
            {review.developerResponse && (
              <div className="mt-4 border-l-2 border-champagne pl-4">
                <p className="text-xs font-semibold tracking-wide text-champagne uppercase">
                  Developer response
                </p>
                <p className="mt-1 text-sm leading-6">{review.developerResponse}</p>
              </div>
            )}
            <button
              type="button"
              onClick={async () => {
                if (!userProfile) return requestAuth();
                await report({ data: { reviewId: review.id, reasonCode: "other" } });
                toast.success("Report received for moderator review");
              }}
              className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground"
            >
              <Flag className="h-3.5 w-3.5" /> Report
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function Enquiry({
  slug,
  configurations,
}: {
  slug: string;
  configurations: Props["configurations"];
}) {
  const { userProfile, requestAuth } = useOnboarding();
  const submit = useServerFn(submitPriceEnquiry);
  const [configurationId, setConfigurationId] = useState(configurations[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!userProfile) return requestAuth();
    if (!consent) return toast.error("Please confirm enquiry consent.");
    setBusy(true);
    try {
      const result = await submit({
        data: {
          slug,
          configurationVariantId: configurationId || null,
          message: message.trim() || null,
          consent: true,
        },
      });
      toast.success(result.duplicate ? "This enquiry was already sent today" : "Enquiry sent");
      setMessage("");
      setConsent(false);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not send enquiry");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-labelledby="enquiry-title" className="lg:sticky lg:top-28 lg:self-start">
      <p className="text-xs tracking-[0.18em] text-champagne uppercase">Private introduction</p>
      <h2 id="enquiry-title" className="mt-2 font-display text-3xl font-bold">
        Price on request
      </h2>
      <div className="mt-6 rounded-2xl border border-champagne/30 bg-card p-5">
        <label htmlFor="enquiry-config" className="text-sm font-medium">
          Configuration
        </label>
        <select
          id="enquiry-config"
          value={configurationId}
          onChange={(event) => setConfigurationId(event.target.value)}
          className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
        >
          {configurations.map((configuration) => (
            <option key={configuration.id} value={configuration.id}>
              {configuration.displayName}
              {configuration.variantName ? ` — ${configuration.variantName}` : ""}
            </option>
          ))}
        </select>
        <label htmlFor="enquiry-message" className="mt-4 block text-sm font-medium">
          Message (optional)
        </label>
        <textarea
          id="enquiry-message"
          value={message}
          maxLength={2000}
          onFocus={() => !userProfile && requestAuth()}
          onChange={(event) => setMessage(event.target.value)}
          className="mt-2 min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm"
          placeholder="Add a question for the developer."
        />
        <label className="mt-4 flex items-start gap-3 text-xs leading-5 text-muted-foreground">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-1"
          />
          I consent to PropCompare sharing my name, verified phone, this property and selected
          configuration, and my message with the owning developer. My budget and activity are not
          shared.
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={send}
          className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-champagne text-sm font-semibold text-lux-black disabled:opacity-50"
        >
          <Send className="h-4 w-4" /> Send enquiry
        </button>
      </div>
    </section>
  );
}

function FeatureUnavailable({ name }: { name: string }) {
  return (
    <section className="rounded-2xl border border-border p-6">
      <h2 className="font-display text-2xl font-bold">{name}</h2>
      <p className="mt-2 text-sm text-muted-foreground">This feature is not currently enabled.</p>
    </section>
  );
}
