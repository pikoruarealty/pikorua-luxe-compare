import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { EmptyState } from "@/components/portal/EmptyState";
import { Skeleton } from "@/components/portal/Skeleton";
import { TableWrap, Th, Td } from "@/components/portal/Table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Download, Plus, Power, Search, Users } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { FilterSelect } from "@/components/admin/FilterSelect";
import { developersQueryOptions, DEVELOPERS_KEY } from "@/api/queries/developers.queries";
import {
  createDeveloper,
  setDeveloperActive,
  type DeveloperAccount,
} from "@/api/functions/admin-developers.functions";
import { toCsv, downloadCsv } from "@/lib/csv-export";

export const Route = createFileRoute("/admin/developers")({
  component: AdminDevelopers,
});

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const foilBtnClass =
  "foil inline-flex shrink-0 items-center gap-2 rounded-full px-5 py-2.5 text-[11px] font-semibold tracking-luxury uppercase";

const toggleBtnClass =
  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-champagne/50 focus-visible:outline-none disabled:opacity-50";

function randomPassword(): string {
  // Readable-ish default the owner can hand over as-is, or overwrite before creating.
  const words = ["Ridge", "Harbor", "Cobalt", "Amber", "Delta", "Marble", "Terra", "Onyx"];
  const w = words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(1000 + Math.random() * 9000);
  return `Pikorua-${w}${n}!`;
}

function AdminDevelopers() {
  const { data: developers, isPending, error } = useQuery(developersQueryOptions());
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const refresh = () => queryClient.invalidateQueries({ queryKey: DEVELOPERS_KEY });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (developers ?? []).filter((d) => {
      if (statusFilter !== "all" && (statusFilter === "active") !== d.isActive) return false;
      if (!q) return true;
      return [d.fullName, d.email].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [developers, query, statusFilter]);

  const exportCsv = () => {
    const csv = toCsv<DeveloperAccount>(rows, [
      { label: "Name", value: (d) => d.fullName },
      { label: "Email", value: (d) => d.email },
      { label: "Added", value: (d) => dateFmt.format(new Date(d.createdAt)) },
      { label: "Total submissions", value: (d) => d.totalSubmissions },
      { label: "Pending submissions", value: (d) => d.pendingSubmissions },
      { label: "Status", value: (d) => (d.isActive ? "Active" : "Disabled") },
    ]);
    downloadCsv(`pikorua-developers-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const toggleMutation = useMutation({
    mutationFn: (vars: { id: string; isActive: boolean }) => setDeveloperActive({ data: vars }),
    onSuccess: async (_r, vars) => {
      await refresh();
      toast.success(vars.isActive ? "Developer re-enabled" : "Developer access revoked");
    },
    onError: (e: Error) => toast.error(e.message || "Could not update"),
  });

  const list = developers ?? [];
  const busy = (id: string) => toggleMutation.isPending && toggleMutation.variables?.id === id;

  return (
    <AdminLayout title="Developers" requireOwner>
      <p className="mb-4 text-sm text-muted-foreground">
        Accounts that can sign in to the developer portal and submit properties for your review.
      </p>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email…"
              className="w-full rounded-lg border border-border bg-background py-2.5 pr-3 pl-9 text-sm text-foreground outline-none focus:border-champagne"
            />
          </div>
          <FilterSelect
            value={statusFilter}
            onChange={setStatusFilter}
            label="All statuses"
            options={["active", "disabled"]}
            optionLabels={{ active: "Active", disabled: "Disabled" }}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-xs font-medium tracking-[0.14em] text-foreground uppercase transition-colors hover:border-foreground/30 disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Export
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-champagne px-5 py-2.5 text-xs font-medium tracking-[0.14em] text-lux-black uppercase transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Add developer
          </button>
        </div>
      </div>

      {isPending && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      )}
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Could not load: {(error as Error).message}
        </p>
      )}

      {!isPending && !error && list.length === 0 && (
        <EmptyState
          icon={Users}
          title="No developer accounts yet"
          message="Add a developer so they can submit properties for your review."
          action={
            <button type="button" onClick={() => setOpen(true)} className={foilBtnClass}>
              <Plus className="h-3.5 w-3.5" /> Add developer
            </button>
          }
        />
      )}

      {!isPending && !error && list.length > 0 && (
        <>
          {/* Mobile: card list */}
          <div className="space-y-3 lg:hidden">
            {rows.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No developers match the current search and filters.
              </p>
            )}
            {rows.map((d) => (
              <div
                key={d.id}
                className="rounded-2xl border border-(--rule) bg-card p-4 shadow-(--shadow-lift)"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{d.fullName || "—"}</p>
                    <p className="truncate text-xs text-muted-foreground">{d.email}</p>
                  </div>
                  <StatusBadge tone={d.isActive ? "positive" : "neutral"}>
                    {d.isActive ? "Active" : "Disabled"}
                  </StatusBadge>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-(--rule) pt-3">
                  <p className="text-xs text-muted-foreground">
                    {d.totalSubmissions} total
                    {d.pendingSubmissions > 0 && (
                      <span className="ml-2 text-champagne">{d.pendingSubmissions} pending</span>
                    )}
                  </p>
                  <button
                    type="button"
                    title={d.isActive ? "Revoke access" : "Re-enable access"}
                    onClick={() => toggleMutation.mutate({ id: d.id, isActive: !d.isActive })}
                    disabled={busy(d.id)}
                    className={toggleBtnClass}
                  >
                    <Power className="h-3.5 w-3.5" />
                    {busy(d.id) ? "…" : d.isActive ? "Revoke" : "Re-enable"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <TableWrap className="hidden lg:block" minWidth="min-w-180">
            <thead className="bg-muted/40">
              <tr className="border-b border-(--rule)">
                <Th>Developer</Th>
                <Th>Added</Th>
                <Th>Submissions</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr
                  key={d.id}
                  className="border-b border-(--rule) transition-colors last:border-0 hover:bg-foreground/2"
                >
                  <Td>
                    <p className="font-medium text-foreground">{d.fullName || "—"}</p>
                    <p className="text-xs text-muted-foreground">{d.email}</p>
                  </Td>
                  <Td className="text-muted-foreground">{dateFmt.format(new Date(d.createdAt))}</Td>
                  <Td className="text-muted-foreground">
                    {d.totalSubmissions} total
                    {d.pendingSubmissions > 0 && (
                      <StatusBadge tone="positive" className="ml-2">
                        {d.pendingSubmissions} pending
                      </StatusBadge>
                    )}
                  </Td>
                  <Td>
                    <StatusBadge tone={d.isActive ? "positive" : "neutral"}>
                      {d.isActive ? "Active" : "Disabled"}
                    </StatusBadge>
                  </Td>
                  <Td className="text-right">
                    <button
                      type="button"
                      title={d.isActive ? "Revoke access" : "Re-enable access"}
                      onClick={() => toggleMutation.mutate({ id: d.id, isActive: !d.isActive })}
                      disabled={busy(d.id)}
                      className={toggleBtnClass}
                    >
                      <Power className="h-3.5 w-3.5" />
                      {busy(d.id) ? "…" : d.isActive ? "Revoke" : "Re-enable"}
                    </button>
                  </Td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    {(developers ?? []).length === 0
                      ? "No developer accounts yet."
                      : "No developers match the current search and filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </TableWrap>
        </>
      )}

      {open && <AddDeveloperDialog onClose={() => setOpen(false)} onCreated={refresh} />}
    </AdminLayout>
  );
}

function AddDeveloperDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(randomPassword);
  const [result, setResult] = useState<{ email: string; password: string } | null>(null);

  const createMutation = useMutation({
    mutationFn: () => createDeveloper({ data: { email, password, fullName } }),
    onSuccess: () => {
      onCreated();
      setResult({ email, password });
    },
    onError: (e: Error) => toast.error(e.message || "Could not create developer account"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm sm:rounded-2xl">
        {result ? (
          <>
            <DialogHeader className="text-left">
              <DialogTitle className="font-display text-lg font-normal">
                Developer account created
              </DialogTitle>
              <DialogDescription>
                Send these to the developer yourself — this is the only time the password is shown.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 rounded-lg border border-(--rule-strong) bg-muted/40 p-3 text-sm">
              <p>
                <span className="text-muted-foreground">Email: </span>
                <span className="font-medium text-foreground">{result.email}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Password: </span>
                <span className="font-medium text-foreground">{result.password}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={`${foilBtnClass} w-full justify-center`}
            >
              Done
            </button>
          </>
        ) : (
          <>
            <DialogHeader className="text-left">
              <DialogTitle className="font-display text-lg font-normal">
                Add a developer
              </DialogTitle>
              <DialogDescription className="sr-only">
                Create a developer account with an email and password.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Field label="Name">
                <Input value={fullName} onChange={setFullName} placeholder="e.g. Rakesh Gala" />
              </Field>
              <Field label="Email">
                <Input value={email} onChange={setEmail} placeholder="developer@example.com" />
              </Field>
              <Field label="Password">
                <Input value={password} onChange={setPassword} />
              </Field>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-full border border-(--rule-strong) px-5 py-2.5 text-[11px] font-semibold tracking-luxury text-foreground uppercase transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-champagne/40 focus-visible:outline-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className={`${foilBtnClass} flex-1 justify-center disabled:opacity-60`}
              >
                {createMutation.isPending ? "Creating…" : "Create"}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-label text-[10px] font-semibold tracking-luxury text-muted-foreground uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-(--rule-strong) bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-champagne focus:ring-2 focus:ring-champagne/30"
    />
  );
}
