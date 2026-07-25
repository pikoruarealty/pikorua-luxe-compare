import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Power } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { developersQueryOptions, DEVELOPERS_KEY } from "@/lib/developers.queries";
import { createDeveloper, setDeveloperActive } from "@/lib/admin-developers.functions";

export const Route = createFileRoute("/admin/developers")({
  component: AdminDevelopers,
});

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

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

  const refresh = () => queryClient.invalidateQueries({ queryKey: DEVELOPERS_KEY });

  const toggleMutation = useMutation({
    mutationFn: (vars: { id: string; isActive: boolean }) => setDeveloperActive({ data: vars }),
    onSuccess: async (_r, vars) => {
      await refresh();
      toast.success(vars.isActive ? "Developer re-enabled" : "Developer access revoked");
    },
    onError: (e: Error) => toast.error(e.message || "Could not update"),
  });

  return (
    <AdminLayout title="Developers" requireOwner>
      <div className="mb-6 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Accounts that can sign in to the developer portal and submit properties for your review.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-champagne px-5 py-2.5 text-xs font-medium tracking-[0.14em] text-lux-black uppercase transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add developer
        </button>
      </div>

      {isPending && <p className="text-sm text-muted-foreground">Loading developers…</p>}
      {error && <p className="text-sm text-red-500">Could not load: {(error as Error).message}</p>}

      {!isPending && !error && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-card text-left">
              <tr className="border-b border-border">
                <Th>Developer</Th>
                <Th>Added</Th>
                <Th>Submissions</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {(developers ?? []).map((d) => (
                <tr key={d.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{d.fullName || "—"}</p>
                    <p className="text-xs text-muted-foreground">{d.email}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {dateFmt.format(new Date(d.createdAt))}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {d.totalSubmissions} total
                    {d.pendingSubmissions > 0 && (
                      <span className="ml-2 rounded-full bg-champagne/15 px-2 py-0.5 text-[10px] font-semibold text-champagne uppercase">
                        {d.pendingSubmissions} pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase ${
                        d.isActive
                          ? "bg-champagne/15 text-champagne"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {d.isActive ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      title={d.isActive ? "Revoke access" : "Re-enable access"}
                      onClick={() => toggleMutation.mutate({ id: d.id, isActive: !d.isActive })}
                      disabled={toggleMutation.isPending && toggleMutation.variables?.id === d.id}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"
                    >
                      <Power className="h-3.5 w-3.5" />
                      {toggleMutation.isPending && toggleMutation.variables?.id === d.id
                        ? "…"
                        : d.isActive
                          ? "Revoke"
                          : "Re-enable"}
                    </button>
                  </td>
                </tr>
              ))}
              {(developers ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    No developer accounts yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6">
        {result ? (
          <>
            <h2 className="font-display text-lg text-foreground">Developer account created</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Send these to the developer yourself — this is the only time the password is shown.
            </p>
            <div className="mt-4 space-y-2 rounded-lg border border-border bg-background p-3 text-sm">
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
              className="mt-5 w-full rounded-full bg-champagne px-5 py-2.5 text-xs font-medium tracking-[0.14em] text-lux-black uppercase transition-opacity hover:opacity-90"
            >
              Done
            </button>
          </>
        ) : (
          <>
            <h2 className="font-display text-lg text-foreground">Add a developer</h2>
            <div className="mt-4 space-y-3">
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
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-full border border-border px-5 py-2.5 text-xs font-medium tracking-[0.14em] text-foreground uppercase transition-colors hover:border-foreground/30"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className="flex-1 rounded-full bg-champagne px-5 py-2.5 text-xs font-medium tracking-[0.14em] text-lux-black uppercase transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {createMutation.isPending ? "Creating…" : "Create"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs tracking-[0.12em] text-muted-foreground uppercase">
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
      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-champagne"
    />
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-3 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase ${className}`}
    >
      {children}
    </th>
  );
}
