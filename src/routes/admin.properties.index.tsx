import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { adminPropertiesQueryOptions, PROPERTIES_KEY } from "@/lib/properties.queries";
import { deleteProperty, setPropertyPublished } from "@/lib/property-crud.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/admin/properties/")({
  component: AdminProperties,
});

function AdminProperties() {
  const { data: properties, isPending, error } = useQuery(adminPropertiesQueryOptions());
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const queryClient = useQueryClient();
  const router = useRouter();

  // Admin writes must refresh both the admin list and the public site's catalog
  // (the root loader feeds PropertiesProvider), so invalidate the router too.
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin", "properties"] });
    await queryClient.invalidateQueries({ queryKey: PROPERTIES_KEY });
    await router.invalidate();
  };

  const publishMutation = useMutation({
    mutationFn: (vars: { id: string; isPublished: boolean }) =>
      setPropertyPublished({ data: vars }),
    onSuccess: async (_r, vars) => {
      await refresh();
      toast.success(vars.isPublished ? "Property published" : "Property hidden from site");
    },
    onError: (e: Error) => toast.error(e.message || "Could not update"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProperty({ data: { id } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Property deleted");
      setPendingDelete(null);
    },
    onError: (e: Error) => toast.error(e.message || "Could not delete"),
  });

  const rows = useMemo(() => {
    const list = properties ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.developer.toLowerCase().includes(q) ||
        p.location.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q),
    );
  }, [properties, query]);

  return (
    <AdminLayout title="Properties" requireOwner>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search properties…"
            className="w-full rounded-lg border border-border bg-background py-2.5 pr-3 pl-9 text-sm text-foreground outline-none focus:border-champagne"
          />
        </div>
        <Link
          to="/admin/properties/new"
          className="inline-flex items-center gap-2 rounded-full bg-champagne px-5 py-2.5 text-xs font-medium tracking-[0.14em] text-lux-black uppercase transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add property
        </Link>
      </div>

      {isPending && <p className="text-sm text-muted-foreground">Loading properties…</p>}
      {error && (
        <p className="text-sm text-red-500">
          Could not load properties: {(error as Error).message}
        </p>
      )}

      {!isPending && !error && (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            {rows.length} of {properties?.length ?? 0} properties
          </p>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-card text-left">
                <tr className="border-b border-border">
                  <Th>Name</Th>
                  <Th>Developer</Th>
                  <Th>Category</Th>
                  <Th>Configuration</Th>
                  <Th>Price</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.rowId} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {p.image ? (
                          <img
                            src={p.image}
                            alt=""
                            className="h-10 w-14 flex-shrink-0 rounded object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-10 w-14 flex-shrink-0 rounded bg-muted" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{p.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{p.location}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.developer}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.category}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.configuration || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.pricePerSqft}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase ${
                          p.isPublished
                            ? "bg-champagne/15 text-champagne"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {p.isPublished ? "Live" : "Hidden"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <IconButton
                          title={p.isPublished ? "Hide from site" : "Publish to site"}
                          onClick={() =>
                            publishMutation.mutate({ id: p.rowId, isPublished: !p.isPublished })
                          }
                        >
                          {p.isPublished ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </IconButton>
                        <Link
                          to="/admin/properties/$propertyId"
                          params={{ propertyId: p.rowId }}
                          title="Edit"
                          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                        <IconButton
                          title="Delete"
                          onClick={() => setPendingDelete({ id: p.rowId, name: p.name })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      No properties match “{query}”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{pendingDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the property from the website and the database. This cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
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

function IconButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
    >
      {children}
    </button>
  );
}
