import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import {
  Briefcase,
  Check,
  GitCompareArrows,
  Heart,
  LayoutList,
  LogOut,
  Mail,
  MapPin,
  NotebookPen,
  Pencil,
  Phone,
  Sparkles,
  ShieldCheck,
  Trash2,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { useOnboarding, type UserProfile } from "@/context/OnboardingContext";
import { useFavoritesStore } from "@/stores/favorites-store";
import { useHydrated } from "@/hooks/use-hydrated";
import { updateProfile as updateProfileFn } from "@/api/functions/profile.functions";
import {
  deleteMyAccount,
  getPrivacyPreferences,
  updateAnalyticsPreference,
} from "@/api/functions/privacy.functions";
import { ANALYTICS_OPT_OUT_STORAGE } from "@/hooks/use-activity-log";
import { useSavedComparesStore } from "@/stores/saved-compares-store";
import { useCompareStore } from "@/stores/compare-store";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Your Account — PropCompare" },
      {
        name: "description",
        content: "Manage your PropCompare profile and saved property preferences.",
      },
    ],
  }),
  component: AccountPage,
});

const PROFESSIONS: { value: UserProfile["profession"]; label: string }[] = [
  { value: "job", label: "Salaried professional" },
  { value: "business", label: "Business owner" },
  { value: "investor", label: "Investor" },
  { value: "other", label: "Other" },
];

const PROFESSION_LABEL: Record<string, string> = Object.fromEntries(
  PROFESSIONS.map((p) => [p.value, p.label]),
);

function AccountPage() {
  const { userProfile, hydrated, setPhase } = useOnboarding();

  // Signed out → invite to create a profile instead of bouncing home.
  if (hydrated && !userProfile) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="container-lux flex min-h-[70vh] flex-col items-center justify-center py-28 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full gold-border">
            <User className="h-6 w-6 text-champagne" />
          </span>
          <p className="mt-6 text-[11px] tracking-luxury text-champagne">Your Account</p>
          <h1 className="mt-3 max-w-xl font-display text-4xl text-ivory sm:text-5xl">
            Create your profile
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
            Sign in with your phone number to save residences across devices, keep your preferences,
            and get advisory tailored to you.
          </p>
          <button
            type="button"
            onClick={() => setPhase("auth")}
            className="mt-8 inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-[11px] font-semibold tracking-luxury transition hover:brightness-110"
            style={{ background: "var(--brand)", color: "var(--brand-ink)" }}
          >
            <Phone className="h-4 w-4" /> Sign in with phone
          </button>
          <Link
            to="/"
            className="mt-4 text-[11px] tracking-luxury text-muted-foreground transition hover:text-foreground"
          >
            Continue browsing instead
          </Link>
        </div>
        <SiteFooter />
      </div>
    );
  }

  if (!userProfile) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
          Loading your account…
        </div>
      </div>
    );
  }

  return <AccountContent profile={userProfile} />;
}

function AccountContent({ profile }: { profile: UserProfile }) {
  const { setUserProfile, quizAnswers, signOut, openQuizForEdit } = useOnboarding();
  const navigate = useNavigate();
  const hydrated = useHydrated();
  const favCount = useFavoritesStore((s) => s.favorites.length);
  const clearFavorites = useFavoritesStore((s) => s.clear);
  const clearSavedComparisons = useSavedComparesStore((s) => s.clear);
  const clearComparison = useCompareStore((s) => s.clear);
  const updateProfile = useServerFn(updateProfileFn);
  const updateAnalytics = useServerFn(updateAnalyticsPreference);
  const deleteAccount = useServerFn(deleteMyAccount);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analyticsOptOut, setAnalyticsOptOut] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    name: profile.name,
    email: profile.email,
    profession: profile.profession,
    businessName: profile.businessName ?? "",
    city: profile.city ?? "",
    notes: profile.notes ?? "",
  });
  useEffect(() => {
    getPrivacyPreferences()
      .then((preference) => setAnalyticsOptOut(preference.analyticsOptOut))
      .catch(() => undefined);
  }, []);

  const startEdit = () => {
    setForm({
      name: profile.name,
      email: profile.email,
      profession: profile.profession,
      businessName: profile.businessName ?? "",
      city: profile.city ?? "",
      notes: profile.notes ?? "",
    });
    setEditing(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required.");
      return;
    }
    setSaving(true);
    const next: UserProfile = {
      ...profile,
      name: form.name.trim(),
      email: form.email.trim(),
      profession: form.profession,
      businessName: form.businessName.trim() || undefined,
      city: form.city.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };
    try {
      const saved = await updateProfile({
        data: {
          name: next.name,
          email: next.email,
          profession: next.profession,
          businessName: next.businessName ?? null,
        },
      });
      setUserProfile({
        ...next,
        name: saved.name ?? next.name,
        email: saved.email ?? "",
        profession: (saved.profession as UserProfile["profession"]) ?? "other",
        businessName: saved.businessName ?? undefined,
      });
      toast.success("Profile updated");
      setEditing(false);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Profile update failed");
    }
    setSaving(false);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  const initials = (profile.name || "P")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const inputCls =
    "w-full rounded-xl border border-border bg-background px-4 py-3 text-[14px] text-foreground outline-none transition focus:border-champagne placeholder:text-muted-foreground/60";

  return (
    <div className="min-h-screen">
      <div aria-hidden className="page-grain" />
      <SiteHeader />
      <main className="container-lux max-w-4xl pt-24 pb-16 sm:pt-28">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="text-[11px] tracking-luxury text-champagne">Your Account</p>
          <h1 className="mt-3 font-display text-4xl text-ivory sm:text-5xl">
            Welcome back, {profile.name?.split(" ")[0] || "guest"}.
          </h1>
        </motion.div>

        {/* Quick links to the other sections */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.06 }}
          className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
          <Link
            to="/favorites"
            className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition hover:border-champagne/50"
          >
            <span className="grid h-10 w-10 place-items-center rounded-full bg-champagne/10 text-champagne">
              <Heart className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-[13px] font-semibold text-foreground">
                Saved residences
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {hydrated ? favCount : 0} saved
              </span>
            </span>
          </Link>
          <Link
            to="/"
            hash="suite"
            className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition hover:border-champagne/50"
          >
            <span className="grid h-10 w-10 place-items-center rounded-full bg-champagne/10 text-champagne">
              <GitCompareArrows className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-[13px] font-semibold text-foreground">
                Comparison suite
              </span>
              <span className="block text-[11px] text-muted-foreground">Compare side by side</span>
            </span>
          </Link>
          <Link
            to="/"
            hash="collection"
            className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition hover:border-champagne/50"
          >
            <span className="grid h-10 w-10 place-items-center rounded-full bg-champagne/10 text-champagne">
              <LayoutList className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-[13px] font-semibold text-foreground">
                The collection
              </span>
              <span className="block text-[11px] text-muted-foreground">Browse residences</span>
            </span>
          </Link>
        </motion.div>

        {/* Profile card */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 rounded-3xl border border-border bg-card p-6 shadow-(--shadow-glass) sm:p-8"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-5">
              <div className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-champagne to-muted-gold font-display text-xl text-lux-black">
                {initials}
              </div>
              <div>
                <h2 className="font-display text-2xl text-ivory">{profile.name}</h2>
                <p className="mt-1 text-xs tracking-luxury text-champagne">
                  {PROFESSION_LABEL[profile.profession] ?? profile.profession}
                  {profile.businessName ? ` · ${profile.businessName}` : ""}
                </p>
              </div>
            </div>
            {!editing && (
              <button
                onClick={startEdit}
                className="inline-flex items-center gap-2 rounded-full gold-border px-4 py-2 text-[11px] tracking-luxury text-ivory transition hover:bg-champagne/10"
              >
                <Pencil className="h-3 w-3" /> Edit profile
              </button>
            )}
          </div>

          {!editing ? (
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <Detail icon={Mail} label="Email" value={profile.email} />
              <Detail icon={Phone} label="Phone" value={profile.phone} />
              <Detail
                icon={Briefcase}
                label="Profession"
                value={PROFESSION_LABEL[profile.profession] ?? profile.profession}
              />
              {profile.businessName && (
                <Detail icon={Sparkles} label="Business" value={profile.businessName} />
              )}
              <Detail icon={MapPin} label="City" value={profile.city || null} />
              <div className="sm:col-span-2">
                <Detail
                  icon={NotebookPen}
                  label="What you're looking for"
                  value={profile.notes || null}
                />
              </div>
            </div>
          ) : (
            <div className="mt-8 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name *">
                  <input
                    className={inputCls}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Your name"
                  />
                </Field>
                <Field label="Email (optional)">
                  <input
                    className={inputCls}
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="you@example.com"
                  />
                </Field>
                <Field label="Phone (verified)">
                  <input
                    className={`${inputCls} cursor-not-allowed opacity-60`}
                    value={profile.phone}
                    disabled
                  />
                </Field>
                <Field label="City">
                  <input
                    className={inputCls}
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    placeholder="e.g. Ahmedabad"
                  />
                </Field>
              </div>

              <Field label="Profession">
                <div className="flex flex-wrap gap-2">
                  {PROFESSIONS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setForm({ ...form, profession: p.value })}
                      className={`rounded-full border px-4 py-2 text-[12px] transition ${
                        form.profession === p.value
                          ? "border-champagne bg-champagne/10 text-champagne"
                          : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </Field>

              {form.profession === "business" && (
                <Field label="Business name">
                  <input
                    className={inputCls}
                    value={form.businessName}
                    onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                    placeholder="Your company"
                  />
                </Field>
              )}

              <Field label="What are you looking for? (optional)">
                <textarea
                  className={`${inputCls} min-h-24 resize-y`}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="e.g. A 4 BHK near Sindhu Bhavan Road, ready to move, with a park-facing view…"
                />
              </Field>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  onClick={save}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[11px] font-semibold tracking-luxury transition hover:brightness-110 disabled:opacity-60"
                  style={{ background: "var(--brand)", color: "var(--brand-ink)" }}
                >
                  <Check className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save changes"}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-3 text-[11px] tracking-luxury text-muted-foreground transition hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" /> Cancel
                </button>
              </div>
            </div>
          )}
        </motion.section>

        {/* Preferences card */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 rounded-3xl border border-border bg-card p-6 shadow-(--shadow-glass) sm:p-8"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] tracking-luxury text-champagne">Saved preferences</p>
              <h3 className="mt-2 font-display text-xl text-ivory">Your property profile</h3>
            </div>
            <button
              onClick={openQuizForEdit}
              className="inline-flex items-center gap-2 rounded-full gold-border px-4 py-2 text-[11px] tracking-luxury text-ivory transition hover:bg-champagne/10"
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
          </div>

          {quizAnswers ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <Pref label="Configuration" values={quizAnswers.bhk} />
              <Pref label="Residence type" values={quizAnswers.propertyType} />
              <Pref
                label="Budget"
                values={[quizAnswers.budgetSub || quizAnswers.budgetRange].filter(Boolean)}
              />
            </div>
          ) : (
            <p className="mt-6 text-sm text-muted-foreground">
              You haven't set preferences yet.{" "}
              <button
                onClick={openQuizForEdit}
                className="text-champagne underline-offset-4 hover:underline"
              >
                Take the quiz
              </button>
              .
            </p>
          )}
        </motion.section>

        <section className="mt-6 rounded-3xl border border-border bg-card p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <ShieldCheck className="mt-1 h-5 w-5 text-champagne" />
            <div className="flex-1">
              <h2 className="font-display text-2xl text-ivory">Privacy controls</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Optional product analytics helps improve preference and comparison flows. Security
                and publication audit logs remain active regardless of this choice.
              </p>
              <label className="mt-5 flex items-center justify-between gap-5 rounded-xl border border-border p-4">
                <span>
                  <span className="block text-sm font-semibold">Opt out of product analytics</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Existing identifiable activity is removed when you opt out.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={analyticsOptOut}
                  onChange={async (event) => {
                    const optedOut = event.target.checked;
                    try {
                      await updateAnalytics({ data: { optedOut } });
                      setAnalyticsOptOut(optedOut);
                      localStorage.setItem(ANALYTICS_OPT_OUT_STORAGE, String(optedOut));
                      toast.success("Analytics preference updated");
                    } catch (cause) {
                      toast.error(cause instanceof Error ? cause.message : "Update failed");
                    }
                  }}
                  className="h-5 w-5"
                />
              </label>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-red-500/25 bg-card p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <Trash2 className="mt-1 h-5 w-5 text-red-500" />
            <div className="flex-1">
              <h2 className="font-display text-2xl text-ivory">Delete account</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                This removes profile data, preferences, saved items, locations and enquiry contact
                details. Reviews remain public as “Former user.” This cannot be undone.
              </p>
              <label htmlFor="delete-confirmation" className="mt-5 block text-sm font-medium">
                Type DELETE to confirm
              </label>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                <input
                  id="delete-confirmation"
                  value={deleteConfirmation}
                  onChange={(event) => setDeleteConfirmation(event.target.value)}
                  className={inputCls}
                />
                <button
                  type="button"
                  disabled={deleting || deleteConfirmation !== "DELETE"}
                  onClick={async () => {
                    setDeleting(true);
                    try {
                      await deleteAccount({ data: { confirmation: "DELETE" } });
                      clearFavorites();
                      clearSavedComparisons();
                      clearComparison();
                      localStorage.removeItem("propcompare:v2-preferences");
                      await signOut();
                      toast.success("Account deleted");
                      navigate({ to: "/" });
                    } catch (cause) {
                      toast.error(cause instanceof Error ? cause.message : "Deletion failed");
                    } finally {
                      setDeleting(false);
                    }
                  }}
                  className="h-12 shrink-0 rounded-full bg-red-600 px-6 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {deleting ? "Deleting…" : "Delete permanently"}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Actions */}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            to="/"
            className="rounded-full px-6 py-3 text-[11px] font-semibold tracking-luxury transition hover:brightness-110"
            style={{ background: "var(--brand)", color: "var(--brand-ink)" }}
          >
            Browse residences
          </Link>
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-3 text-[11px] tracking-luxury text-muted-foreground transition hover:border-red-400/50 hover:text-red-500"
          >
            <LogOut className="h-3 w-3" /> Sign out
          </button>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] tracking-[0.22em] uppercase text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string | null;
}) {
  return (
    <div className="rounded-2xl border border-border bg-secondary/60 p-4">
      <div className="flex items-center gap-2 text-[10px] tracking-[0.22em] uppercase text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-2 text-sm text-ivory">{value || "—"}</div>
    </div>
  );
}

function Pref({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <p className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground">{label}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {values.length === 0 ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : (
          values.map((v) => (
            <span
              key={v}
              className="rounded-full border border-champagne/30 bg-champagne/5 px-3 py-1 text-xs text-champagne"
            >
              {v}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
