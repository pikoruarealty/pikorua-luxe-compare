import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Download, Eye, EyeOff, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { IconButton } from "@/components/portal/IconButton";
import { EmptyState } from "@/components/portal/EmptyState";
import { Skeleton } from "@/components/portal/Skeleton";
import { TableWrap, Th, Td } from "@/components/portal/Table";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { FilterSelect } from "@/components/admin/FilterSelect";
import { adminPropertiesQueryOptions, PROPERTIES_KEY } from "@/api/queries/properties.queries";
import { deleteProperty, setPropertyPublished } from "@/api/functions/property-crud.functions";
import { toCsv, downloadCsv } from "@/lib/csv-export";
import type { AdminProperty } from "@/api/functions/properties.functions";
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

function AdminProperties() {
  const { data: properties, isPending, error } = useQuery(adminPropertiesQueryOptions());
  const [query, setQuery] = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const queryClient = useQueryClient();
  const router = useRouter();

  const cities = useMemo(
    () => [...new Set((properties ?? []).map((p) => p.city).filter(Boolean))].sort(),
    [properties],
  );
  const categories = useMemo(
    () => [...new Set((properties ?? []).map((p) => p.category).filter(Boolean))].sort(),
    [properties],
  );

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
    const q = query.trim().toLowerCase();
    return (properties ?? []).filter((p) => {
      if (cityFilter !== "all" && p.city !== cityFilter) return false;
      if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
      if (statusFilter !== "all" && (statusFilter === "live") !== p.isPublished) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.developer.toLowerCase().includes(q) ||
        p.location.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q)
      );
    });
  }, [properties, query, cityFilter, categoryFilter, statusFilter]);

  const exportCsv = () => {
    const csv = toCsv<AdminProperty>(rows, [
      { label: "Name", value: (p) => p.name },
      { label: "Developer", value: (p) => p.developer },
      { label: "Category", value: (p) => p.category },
      { label: "Configuration", value: (p) => p.configuration },
      { label: "Price", value: (p) => p.pricePerSqft },
      { label: "Location", value: (p) => p.location },
      { label: "City", value: (p) => p.city },
      { label: "State", value: (p) => p.state },
      { label: "Status", value: (p) => p.status },
      { label: "Possession", value: (p) => p.possession },
      { label: "RERA ID", value: (p) => p.reraId },
      { label: "Total units", value: (p) => p.totalUnits },
      { label: "Published", value: (p) => (p.isPublished ? "Live" : "Hidden") },
    ]);
    downloadCsv(`propcompare-properties-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const isBusy = (id: string) => publishMutation.isPending && publishMutation.variables?.id === id;

  return (
    <AdminLayout title="Properties" requireOwner>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search properties…"
              className="w-full rounded-lg border border-(--rule-strong) bg-background py-2.5 pr-3 pl-9 text-sm text-foreground outline-none transition-colors focus:border-champagne focus:ring-2 focus:ring-champagne/30"
            />
          </div>
          <FilterSelect
            value={cityFilter}
            onChange={setCityFilter}
            label="All cities"
            options={cities}
          />
          <FilterSelect
            value={categoryFilter}
            onChange={setCategoryFilter}
            label="All categories"
            options={categories}
          />
          <FilterSelect
            value={statusFilter}
            onChange={setStatusFilter}
            label="All statuses"
            options={["live", "hidden"]}
            optionLabels={{ live: "Live", hidden: "Hidden" }}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-2 rounded-full border border-(--rule-strong) px-5 py-2.5 text-[11px] font-semibold tracking-luxury text-foreground uppercase transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-champagne/40 focus-visible:outline-none disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Export
          </button>
          <Link
            to="/admin/properties/new"
            className="foil inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[11px] font-semibold tracking-luxury uppercase"
          >
            <Plus className="h-3.5 w-3.5" /> Add property
          </Link>
        </div>
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
          title={
            query || cityFilter !== "all" || categoryFilter !== "all" || statusFilter !== "all"
              ? "No matches"
              : "No properties yet"
          }
          message={
            query || cityFilter !== "all" || categoryFilter !== "all" || statusFilter !== "all"
              ? "No properties match the current search and filters."
              : "Add your first property to publish it to the site."
          }
          action={
            <Link
              to="/admin/properties/new"
              className="foil inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[11px] font-semibold tracking-luxury uppercase"
            >
              <Plus className="h-3.5 w-3.5" /> Add property
            </Link>
          }
        />
      )}

      {!isPending && !error && rows.length > 0 && (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            {rows.length} of {properties?.length ?? 0} properties
          </p>

          {/* Mobile: card list */}
          <div className="space-y-3 lg:hidden">
            {rows.map((p) => (
              <div
                key={p.rowId}
                className="rounded-2xl border border-(--rule) bg-card p-4 shadow-(--shadow-lift)"
              >
                <div className="flex items-start gap-3">
                  {p.image ? (
                    <img
                      src={p.image}
                      alt=""
                      className="h-12 w-16 shrink-0 rounded-lg object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-12 w-16 shrink-0 rounded-lg bg-muted" />
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
                <div className="mt-3 flex items-center justify-end gap-1 border-t border-(--rule) pt-3">
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
          <TableWrap className="hidden lg:block" minWidth="min-w-215">
            <thead className="bg-muted/40">
              <tr className="border-b border-(--rule)">
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
                  className="border-b border-(--rule) transition-colors last:border-0 hover:bg-foreground/2"
                >
                  <Td>
                    <div className="flex items-center gap-3">
                      {p.image ? (
                        <img
                          src={p.image}
                          alt=""
                          className="h-10 w-14 shrink-0 rounded object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-10 w-14 shrink-0 rounded bg-muted" />
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
