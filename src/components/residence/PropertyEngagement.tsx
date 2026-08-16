import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Flag, MessageSquareText, Send, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  deleteOwnReview,
  getOwnReview,
  getPublicReviews,
  reportPublicReview,
  saveOwnReview,
  submitPriceEnquiry,
} from "@/api/functions/engagement.functions";
import { useOnboarding } from "@/context/OnboardingContext";

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
  const remove = useServerFn(deleteOwnReview);
  const report = useServerFn(reportPublicReview);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const reviewsQuery = useQuery({
    queryKey: ["public-reviews", slug],
    queryFn: () => getPublicReviews({ data: { slug } }),
  });
  const ownQuery = useQuery({
    queryKey: ["own-review", slug, userProfile?.uid],
    queryFn: () => getOwnReview({ data: { slug } }),
    enabled: Boolean(userProfile),
  });
  useEffect(() => {
    if (!ownQuery.data) return;
    setRating(ownQuery.data.rating);
    setText(ownQuery.data.text ?? "");
  }, [ownQuery.data]);
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["public-reviews", slug] }),
      queryClient.invalidateQueries({ queryKey: ["own-review", slug] }),
    ]);
  };
  const submit = async () => {
    if (!userProfile) return requestAuth();
    setBusy(true);
    try {
      await save({ data: { slug, rating, text: text.trim() || null } });
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
      setText("");
      setRating(5);
      toast.success("Review deleted");
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-labelledby="reviews-title">
      <p className="text-xs tracking-[0.18em] text-champagne uppercase">Phone-verified voices</p>
      <h2 id="reviews-title" className="mt-2 font-display text-3xl font-bold">
        Reviews
      </h2>
      <div className="mt-6 rounded-2xl border border-border bg-card p-5">
        <div className="flex gap-1" aria-label={`Rating ${rating} of 5`}>
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              aria-label={`${value} star${value === 1 ? "" : "s"}`}
              onClick={() => (userProfile ? setRating(value) : requestAuth())}
              className="rounded p-1 focus-visible:ring-2 focus-visible:ring-champagne"
            >
              <Star
                className={`h-5 w-5 ${value <= rating ? "fill-champagne text-champagne" : "text-muted-foreground"}`}
              />
            </button>
          ))}
        </div>
        <label className="mt-4 block text-sm font-medium" htmlFor="property-review">
          Review (optional)
        </label>
        <textarea
          id="property-review"
          maxLength={2000}
          value={text}
          onFocus={() => !userProfile && requestAuth()}
          onChange={(event) => setText(event.target.value)}
          placeholder="Share factual, first-hand feedback. Prices and contact details are not allowed."
          className="mt-2 min-h-28 w-full rounded-xl border border-border bg-background p-3 text-sm"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">{text.length}/2,000</span>
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
                <p className="text-xs text-muted-foreground">Phone verified</p>
              </div>
              <span className="inline-flex items-center gap-1 text-sm">
                <Star className="h-4 w-4 fill-champagne text-champagne" /> {review.rating}/5
              </span>
            </div>
            {review.text && (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{review.text}</p>
            )}
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
