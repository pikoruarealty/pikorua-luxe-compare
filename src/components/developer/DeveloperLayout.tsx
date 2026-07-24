import { type ReactNode, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, LogOut, Plus } from "lucide-react";
import { adminMeQueryOptions, ADMIN_ME_KEY } from "@/lib/admin.queries";
import { supabase } from "@/integrations/supabase/client";

const NAV = [
  { to: "/developer", label: "My Properties", icon: LayoutDashboard },
  { to: "/developer/properties/new", label: "Add Property", icon: Plus },
];

function FullScreen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      {children}
    </div>
  );
}

/** Mirrors AdminLayout's session-guard pattern, but for the developer role —
 *  same admin_profiles-backed auth, its own portal shell. */
export function DeveloperLayout({ children, title }: { children: ReactNode; title?: string }) {
  const { data: profile, isPending } = useQuery(adminMeQueryOptions());
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (isPending) return;
    if (!profile) {
      navigate({ to: "/admin/login" });
    } else if (profile.role !== "developer") {
      // An owner's own session is a valid admin_profiles row too, but this
      // portal is for developer accounts specifically — send anyone else to
      // where their role actually belongs instead of letting them straight in.
      navigate({ to: "/admin" });
    }
  }, [isPending, profile, navigate]);

  if (isPending) {
    return (
      <FullScreen>
        <p className="text-sm tracking-[0.2em] text-muted-foreground uppercase">Loading…</p>
      </FullScreen>
    );
  }
  if (!profile || profile.role !== "developer") {
    return (
      <FullScreen>
        <p className="text-sm tracking-[0.2em] text-muted-foreground uppercase">
          Redirecting…
        </p>
      </FullScreen>
    );
  }

  const signOut = async () => {
    await supabase.auth.signOut();
    queryClient.setQueryData(ADMIN_ME_KEY, null);
    navigate({ to: "/admin/login" });
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="flex w-60 flex-shrink-0 flex-col border-r border-border bg-card">
        <div className="border-b border-border px-6 py-5">
          <p className="font-display text-lg tracking-[0.2em] text-champagne">PIKORUA</p>
          <p className="mt-1 text-[10px] tracking-[0.24em] text-muted-foreground uppercase">
            Developer Portal
          </p>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = to === "/developer" ? pathname === "/developer" : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? "bg-champagne/15 text-champagne"
                    : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border px-3 py-4">
          <div className="px-3 pb-3">
            <p className="truncate text-xs text-foreground">{profile.fullName || profile.email}</p>
            <p className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">Developer</p>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden">
        {title && (
          <header className="border-b border-border px-8 py-6">
            <h1 className="font-display text-2xl text-foreground">{title}</h1>
          </header>
        )}
        <div className="px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
