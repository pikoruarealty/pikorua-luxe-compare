import { type ReactNode, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Building2, Inbox, LayoutDashboard, ShieldCheck, UserRound, Users } from "lucide-react";
import { adminMeQueryOptions, ADMIN_ME_KEY } from "@/api/queries/admin.queries";
import { supabase } from "@/integrations/supabase/client";
import { PortalShell, type PortalNavItem } from "@/components/portal/PortalShell";

interface NavItem extends PortalNavItem {
  ownerOnly?: boolean;
}

const NAV: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/properties", label: "Properties", icon: Building2 },
  { to: "/admin/customers", label: "Customers", icon: UserRound, ownerOnly: true },
  { to: "/admin/submissions", label: "Submissions", icon: Inbox, ownerOnly: true },
  { to: "/admin/moderation", label: "Moderation", icon: ShieldCheck },
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

  // Client-side guard: once the session check settles with no admin, bounce to
  // login — and a developer's own session belongs in their own portal, not here.
  useEffect(() => {
    if (isPending) return;
    if (!profile) {
      navigate({ to: "/admin/login" });
    } else if (profile.role === "developer") {
      navigate({ to: "/developer" });
    }
  }, [isPending, profile, navigate]);

  if (isPending) {
    return (
      <FullScreen>
        <p className="font-label text-sm tracking-luxury text-muted-foreground">Loading…</p>
      </FullScreen>
    );
  }
  if (!profile || profile.role === "developer") {
    return (
      <FullScreen>
        <p className="font-label text-sm tracking-luxury text-muted-foreground">Redirecting…</p>
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
            className="foil mt-6 inline-flex rounded-full px-5 py-2.5 text-xs tracking-[0.18em] uppercase"
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
    <PortalShell
      nav={visibleNav}
      homePath="/admin"
      portalLabel="Admin Portal"
      userLabel={profile.email}
      userRole={profile.role}
      onSignOut={signOut}
      title={title}
    >
      {children}
    </PortalShell>
  );
}
