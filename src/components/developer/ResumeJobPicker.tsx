import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { listBrochureJobs } from "@/api/functions/brochure-extract.functions";

function formatJobDate(createdAt: string): string {
  return new Date(createdAt).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** "Developer - Property", trimmed to whichever half the OCR actually
 *  found. Falls back to the date if neither name was extracted (a layout
 *  PDF with no cover page, or a job still missing its result). */
function formatJobTitle(job: {
  propertyName: string | null;
  developerName: string | null;
  createdAt: string;
}): string {
  const parts = [job.developerName, job.propertyName].filter((p): p is string =>
    Boolean(p?.trim()),
  );
  return parts.length > 0 ? parts.join(" - ") : formatJobDate(job.createdAt);
}

/** Searchable replacement for typing a raw job id — every brochure job this
 *  developer has started gets an owner row the moment it's created, so once
 *  that's in place there's no reason anyone should ever need to know or copy
 *  an id by hand. Labeled "Developer - Property" from the OCR draft itself;
 *  searchable on either name plus the raw id as a fallback. */
export function ResumeJobPicker({
  onSelect,
  disabled,
}: {
  onSelect: (jobId: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listJobsFn = useServerFn(listBrochureJobs);

  const {
    data: jobs,
    isPending,
    isError,
  } = useQuery({
    queryKey: ["brochure-jobs"],
    queryFn: () => listJobsFn(),
    enabled: open,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const filtered = useMemo(() => {
    const list = jobs ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (job) =>
        job.jobId.toLowerCase().includes(q) ||
        (job.propertyName?.toLowerCase().includes(q) ?? false) ||
        (job.developerName?.toLowerCase().includes(q) ?? false),
    );
  }, [jobs, query]);

  return (
    <div ref={rootRef} className="relative w-full max-w-sm">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          disabled={disabled}
          placeholder="Search your extractions…"
          className="w-full rounded-lg border border-(--rule-strong) bg-background py-2 pr-3 pl-9 text-sm text-foreground outline-none focus:border-champagne disabled:opacity-50"
        />
      </div>

      {open && (
        <div className="absolute top-[calc(100%+4px)] left-0 z-20 max-h-64 w-full overflow-y-auto rounded-lg border border-(--rule-strong) bg-card py-1 shadow-(--shadow-lift)">
          {isPending && (
            <p className="px-3 py-2 text-xs text-muted-foreground">Loading your extractions…</p>
          )}
          {isError && <p className="px-3 py-2 text-xs text-red-500">Couldn't load your jobs.</p>}
          {!isPending && !isError && filtered.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {jobs?.length ? "No match." : "No brochure extractions yet."}
            </p>
          )}
          {filtered.map((job) => (
            <button
              key={job.jobId}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelect(job.jobId);
                setOpen(false);
                setQuery("");
              }}
              className="flex w-full flex-col items-start px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-foreground/5"
            >
              <span>{formatJobTitle(job)}</span>
              <span className="font-label text-[10px] tracking-luxury text-muted-foreground">
                {formatJobDate(job.createdAt)} · {job.jobId}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
