import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { PageHeader } from "@/components/portal/PageHeader";
import { SearchInput } from "@/components/portal/SearchInput";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { IconButton } from "@/components/portal/IconButton";
import { EmptyState } from "@/components/portal/EmptyState";
import { Skeleton } from "@/components/portal/Skeleton";
import { TableWrap, Th, Td } from "@/components/portal/Table";
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

const editLinkClass =
  "grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-champagne/50 focus-visible:outline-none";

const addPropertyClass =
  "foil inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[11px] font-semibold tracking-luxury uppercase";

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

  const isBusy = (id: string) => publishMutation.isPending && publishMutation.variables?.id === id;

  return (
    <AdminLayout requireOwner>
      <PageHeader
        eyebrow="Catalog"
        title="Properties"
        description="Everything in the Pikorua catalog — publish, edit, or remove listings."
        actions={
          <Link to="/admin/properties/new" className={addPropertyClass}>
            <Plus className="h-3.5 w-3.5" /> Add property
          </Link>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Search properties…" />
        {!isPending && !error && (
          <p className="text-xs text-muted-foreground">
            {rows.length} of {properties?.length ?? 0} properties
          </p>
        )}
      </div>

      {isPending && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      )}
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Could not load properties: {(error as Error).message}
        </p>
      )}

      {!isPending && !error && rows.length === 0 && (
        <EmptyState
          icon={Building2}
          title={query ? "No matches" : "No properties yet"}
          message={
            query
              ? `Nothing in the catalog matches “${query}”.`
              : "Add your first property to publish it to the site."
          }
          action={
            query ? undefined : (
              <Link to="/admin/properties/new" className={addPropertyClass}>
                <Plus className="h-3.5 w-3.5" /> Add property
              </Link>
            )
          }
        />
      )}

      {!isPending && !error && rows.length > 0 && (
        <>
          {/* Mobile: card list */}
          <div className="space-y-3 lg:hidden">
            {rows.map((p) => (
              <div
                key={p.rowId}
                className="rounded-2xl border border-[var(--rule)] bg-card p-4 shadow-[var(--shadow-lift)]"
              >
                <div className="flex items-start gap-3">
                  {p.image ? (
                    <img
                      src={p.image}
                      alt=""
                      className="h-12 w-16 flex-shrink-0 rounded-lg object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-12 w-16 flex-shrink-0 rounded-lg bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.location}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {[p.developer, p.category, p.pricePerSqft].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <StatusBadge tone={p.isPublished ? "positive" : "neutral"}>
                    {p.isPublished ? "Live" : "Hidden"}
                  </StatusBadge>
                </div>
                <div className="mt-3 flex items-center justify-end gap-1 border-t border-[var(--rule)] pt-3">
                  <IconButton
                    title={p.isPublished ? "Hide from site" : "Publish to site"}
                    onClick={() =>
                      publishMutation.mutate({ id: p.rowId, isPublished: !p.isPublished })
                    }
                    disabled={isBusy(p.rowId)}
                  >
                    {p.isPublished ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </IconButton>
                  <Link
                    to="/admin/properties/$propertyId"
                    params={{ propertyId: p.rowId }}
                    title="Edit"
                    aria-label={`Edit ${p.name}`}
                    className={editLinkClass}
                  >
                    <Pencil className="h-4 w-4" />
                  </Link>
                  <IconButton
                    title="Delete"
                    tone="danger"
                    onClick={() => setPendingDelete({ id: p.rowId, name: p.name })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <TableWrap className="hidden lg:block" minWidth="min-w-[860px]">
            <thead className="bg-muted/40">
              <tr className="border-b border-[var(--rule)]">
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
                <tr
                  key={p.rowId}
                  className="border-b border-[var(--rule)] transition-colors last:border-0 hover:bg-foreground/2"
                >
                  <Td>
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
                  </Td>
                  <Td className="text-muted-foreground">{p.developer}</Td>
                  <Td className="text-muted-foreground">{p.category}</Td>
                  <Td className="text-muted-foreground">{p.configuration || "—"}</Td>
                  <Td className="text-muted-foreground">{p.pricePerSqft}</Td>
                  <Td>
                    <StatusBadge tone={p.isPublished ? "positive" : "neutral"}>
                      {p.isPublished ? "Live" : "Hidden"}
                    </StatusBadge>
                  </Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <IconButton
                        title={p.isPublished ? "Hide from site" : "Publish to site"}
                        onClick={() =>
                          publishMutation.mutate({ id: p.rowId, isPublished: !p.isPublished })
                        }
                        disabled={isBusy(p.rowId)}
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
                        aria-label={`Edit ${p.name}`}
                        className={editLinkClass}
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <IconButton
                        title="Delete"
                        tone="danger"
                        onClick={() => setPendingDelete({ id: p.rowId, name: p.name })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
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
