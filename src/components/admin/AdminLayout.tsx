import { type ReactNode, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Building2, Inbox, LayoutDashboard, LogOut, UserRound, Users } from "lucide-react";
import { adminMeQueryOptions, ADMIN_ME_KEY } from "@/lib/admin.queries";
import { supabase } from "@/integrations/supabase/client";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  ownerOnly?: boolean;
}

const NAV: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/properties", label: "Properties", icon: Building2 },
  { to: "/admin/customers", label: "Customers", icon: UserRound, ownerOnly: true },
  { to: "/admin/submissions", label: "Submissions", icon: Inbox, ownerOnly: true },
  { to: "/admin/developers", label: "Developers", icon: Users, ownerOnly: true },
];

function FullScreen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      {children}
    </div>
  );
}

export function AdminLayout({
  children,
  requireOwner = false,
  title,
}: {
  children: ReactNode;
  requireOwner?: boolean;
  title?: string;
}) {
  const { data: profile, isPending } = useQuery(adminMeQueryOptions());
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Client-side guard: once the session check settles with no admin, bounce to login.
  useEffect(() => {
    if (!isPending && !profile) navigate({ to: "/admin/login" });
  }, [isPending, profile, navigate]);

  if (isPending) {
    return (
      <FullScreen>
        <p className="text-sm tracking-[0.2em] text-muted-foreground uppercase">Loading…</p>
      </FullScreen>
    );
  }
  if (!profile) {
    return (
      <FullScreen>
        <p className="text-sm tracking-[0.2em] text-muted-foreground uppercase">
          Redirecting to sign in…
        </p>
      </FullScreen>
    );
  }
  if (requireOwner && profile.role !== "owner") {
    return (
      <FullScreen>
        <div className="max-w-sm text-center">
          <h1 className="font-display text-2xl text-foreground">Owner access only</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This section is restricted to the site owner.
          </p>
          <Link
            to="/admin"
            className="mt-6 inline-flex rounded-full bg-champagne px-5 py-2.5 text-xs tracking-[0.18em] text-lux-black uppercase"
          >
            Back to dashboard
          </Link>
        </div>
      </FullScreen>
    );
  }

  const signOut = async () => {
    await supabase.auth.signOut();
    queryClient.setQueryData(ADMIN_ME_KEY, null);
    navigate({ to: "/admin/login" });
  };

  const visibleNav = NAV.filter((n) => !n.ownerOnly || profile.role === "owner");

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="flex w-60 flex-shrink-0 flex-col border-r border-border bg-card">
        <div className="border-b border-border px-6 py-5">
          <p className="font-display text-lg tracking-[0.2em] text-champagne">PIKORUA</p>
          <p className="mt-1 text-[10px] tracking-[0.24em] text-muted-foreground uppercase">
            Admin Portal
          </p>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {visibleNav.map(({ to, label, icon: Icon }) => {
            const active = to === "/admin" ? pathname === "/admin" : pathname.startsWith(to);
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
            <p className="truncate text-xs text-foreground">{profile.email}</p>
            <p className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
              {profile.role}
            </p>
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
