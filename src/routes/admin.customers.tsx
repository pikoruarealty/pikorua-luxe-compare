import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Search, X } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { FilterSelect } from "@/components/admin/FilterSelect";
import { getCustomers, getCustomerDetail, type CustomerSummary } from "@/lib/customers.functions";
import type { ActivityEvent } from "@/lib/activity.functions";
import type { QuizAnswersDTO } from "@/lib/profile.functions";
import { toCsv, downloadCsv } from "@/lib/csv-export";
import { parseBudget } from "@/lib/preference-filter";

export const Route = createFileRoute("/admin/customers")({
  component: AdminCustomers,
});

const EVENT_LABEL: Record<ActivityEvent, string> = {
  signup: "Signed up",
  quiz_completed: "Completed the quiz",
  property_view: "Viewed",
  compare_add: "Added to compare",
  compare_open: "Opened comparison",
  favorite_add: "Saved to favourites",
  contact_click: "Clicked contact",
};

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

function quizSummary(q: QuizAnswersDTO | null): string {
  if (!q) return "Not completed";
  const parts = [
    [q.state, q.city].filter(Boolean).join(" · "),
    (q.propertyType ?? []).join(", "),
    (q.bhk ?? []).join(", "),
    q.budgetSub || q.budgetRange,
  ].filter(Boolean);
  return parts.length ? parts.join(" | ") : "Not completed";
}

function AdminCustomers() {
  const {
    data: customers,
    isPending,
    error,
  } = useQuery({
    queryKey: ["admin", "customers"],
    queryFn: () => getCustomers(),
    retry: false,
  });
  const [query, setQuery] = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [budgetFilter, setBudgetFilter] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const cities = useMemo(
    () =>
      [...new Set((customers ?? []).map((c) => c.quizAnswers?.city).filter(Boolean))].sort() as string[],
    [customers],
  );

  // Sorted by actual Cr value (lowest first), not alphabetically — "₹ 11 – 15 Cr"
  // would otherwise sort before "₹ 6 – 10 Cr".
  const budgetRanges = useMemo(() => {
    const set = new Set((customers ?? []).map((c) => c.quizAnswers?.budgetRange).filter(Boolean));
    return [...set].sort(
      (a, b) => (parseBudget(a)?.[0] ?? Infinity) - (parseBudget(b)?.[0] ?? Infinity),
    ) as string[];
  }, [customers]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (customers ?? []).filter((c) => {
      if (cityFilter !== "all" && c.quizAnswers?.city !== cityFilter) return false;
      if (budgetFilter !== "all" && c.quizAnswers?.budgetRange !== budgetFilter) return false;
      if (!q) return true;
      return [c.name, c.phone, c.email, c.profession, c.businessName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [customers, query, cityFilter, budgetFilter]);

  const exportCsv = () => {
    const csv = toCsv<CustomerSummary>(rows, [
      { label: "Name", value: (c) => c.name },
      { label: "Phone", value: (c) => c.phone },
      { label: "Email", value: (c) => c.email },
      { label: "Profession", value: (c) => c.profession },
      { label: "Business", value: (c) => c.businessName },
      { label: "State", value: (c) => c.quizAnswers?.state },
      { label: "City", value: (c) => c.quizAnswers?.city },
      { label: "Looking for", value: (c) => c.quizAnswers?.propertyType?.join(", ") },
      { label: "Configuration", value: (c) => c.quizAnswers?.bhk?.join(", ") },
      { label: "Budget", value: (c) => c.quizAnswers?.budgetSub || c.quizAnswers?.budgetRange },
      { label: "Interactions", value: (c) => c.activityCount },
      { label: "Joined", value: (c) => fmtDate(c.createdAt) },
    ]);
    downloadCsv(`pikorua-customers-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <AdminLayout title="Customers" requireOwner>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, phone, email…"
              className="w-full rounded-lg border border-border bg-background py-2.5 pr-3 pl-9 text-sm text-foreground outline-none focus:border-champagne"
            />
          </div>
          <FilterSelect
            value={cityFilter}
            onChange={setCityFilter}
            label="All cities"
            options={cities}
          />
          <FilterSelect
            value={budgetFilter}
            onChange={setBudgetFilter}
            label="All budgets"
            options={budgetRanges}
          />
          <p className="text-xs text-muted-foreground">
            {rows.length} of {customers?.length ?? 0} customers
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-xs font-medium tracking-[0.14em] text-foreground uppercase transition-colors hover:border-foreground/30 disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> Export
        </button>
      </div>

      {isPending && <p className="text-sm text-muted-foreground">Loading customers…</p>}
      {error && <p className="text-sm text-red-500">{(error as Error).message}</p>}

      {!isPending && !error && rows.length === 0 && (
        <div className="rounded-xl border border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No customers yet. They appear here as soon as someone signs up on the website.
          </p>
        </div>
      )}

      {!isPending && !error && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-card text-left">
              <tr className="border-b border-border">
                <Th>Customer</Th>
                <Th>Contact</Th>
                <Th>Profession</Th>
                <Th>Requirements (from quiz)</Th>
                <Th>Interactions</Th>
                <Th>Joined</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setOpenId(c.id)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-foreground/5"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{c.name || "—"}</p>
                    {c.businessName && (
                      <p className="text-xs text-muted-foreground">{c.businessName}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-foreground">{c.phone}</p>
                    <p className="text-xs text-muted-foreground">{c.email || "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.profession || "—"}</td>
                  <td className="max-w-xs px-4 py-3">
                    <span
                      className={c.quizAnswers ? "text-foreground" : "text-muted-foreground italic"}
                    >
                      {quizSummary(c.quizAnswers)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-champagne/15 px-2.5 py-1 text-xs font-medium text-champagne">
                      {c.activityCount}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {fmtDate(c.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId && <CustomerDrawer id={openId} onClose={() => setOpenId(null)} />}
    </AdminLayout>
  );
}

function CustomerDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isPending, error } = useQuery({
    queryKey: ["admin", "customer", id],
    queryFn: () => getCustomerDetail({ data: { id } }),
    retry: false,
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside
        className="h-full w-full max-w-lg overflow-y-auto bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="font-display text-xl text-foreground">{data?.name || "Customer"}</h2>
            <p className="text-xs text-muted-foreground">
              Joined {fmtDate(data?.createdAt ?? null)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="text-sm text-red-500">{(error as Error).message}</p>}

        {data && (
          <div className="space-y-8">
            <DrawerSection title="Details submitted at sign-up">
              <Detail label="Name" value={data.name} />
              <Detail label="Phone" value={data.phone} />
              <Detail label="Email" value={data.email} />
              <Detail label="Profession" value={data.profession} />
              <Detail label="Business" value={data.businessName} />
            </DrawerSection>

            <DrawerSection title="Requirements (quiz answers)">
              {data.quizAnswers ? (
                <>
                  <Detail label="State" value={data.quizAnswers.state} />
                  <Detail label="City" value={data.quizAnswers.city} />
                  <Detail
                    label="Looking for"
                    value={(data.quizAnswers.propertyType ?? []).join(", ")}
                  />
                  <Detail label="Configuration" value={(data.quizAnswers.bhk ?? []).join(", ")} />
                  <Detail label="Budget range" value={data.quizAnswers.budgetRange} />
                  <Detail label="Budget (exact)" value={data.quizAnswers.budgetSub} />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This customer hasn't completed the quiz yet.
                </p>
              )}
            </DrawerSection>

            <DrawerSection title={`Activity (${data.activity.length})`}>
              {data.activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No interactions recorded yet.</p>
              ) : (
                <ul className="space-y-3">
                  {data.activity.map((a) => (
                    <li key={a.id} className="flex items-start justify-between gap-4">
                      <span className="text-sm text-foreground">
                        {EVENT_LABEL[a.event] ?? a.event}
                        {a.propertyName && (
                          <span className="text-champagne"> {a.propertyName}</span>
                        )}
                      </span>
                      <span className="flex-shrink-0 text-xs text-muted-foreground">
                        {fmtDate(a.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </DrawerSection>
          </div>
        )}
      </aside>
    </div>
  );
}

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-[10px] font-semibold tracking-[0.16em] text-champagne uppercase">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border pb-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-sm text-foreground">{value || "—"}</span>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
      {children}
    </th>
  );
}
