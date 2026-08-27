import { type ReactNode, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { BarChart3, Inbox, LayoutDashboard, MessageSquareText, Plus } from "lucide-react";
import { adminMeQueryOptions, ADMIN_ME_KEY } from "@/api/queries/admin.queries";
import { authClient } from "@/lib/auth/auth-client";
import { PortalShell, type PortalNavItem } from "@/components/portal/PortalShell";

const NAV: PortalNavItem[] = [
  { to: "/developer", label: "My Properties", icon: LayoutDashboard },
  { to: "/developer/enquiries", label: "Enquiries", icon: Inbox },
  { to: "/developer/reviews", label: "Reviews", icon: MessageSquareText },
  { to: "/developer/intelligence", label: "Intelligence", icon: BarChart3 },
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

  useEffect(() => {
    if (isPending) return;
    if (!profile) {
      navigate({ to: "/admin/login" });
    } else if (profile.role !== "developer") {
      // An owner's own session is a valid admin_profiles row too, but this
      // portal is for developer accounts specifically — send anyone else to
      // where their role actually belongs instead of letting them straight in.
      navigate({ to: "/admin" });
    } else if (
      !profile.twoFactorEnabled &&
      import.meta.env.VITE_STAFF_MFA_ENFORCE !== "false" &&
      (import.meta.env.PROD || import.meta.env.VITE_STAFF_MFA_ENFORCE === "true")
    ) {
      navigate({ to: "/admin/mfa", search: { mode: "enroll" } });
    }
  }, [isPending, profile, navigate]);

  if (isPending) {
    return (
      <FullScreen>
        <p className="font-label text-sm tracking-luxury text-muted-foreground">Loading…</p>
      </FullScreen>
    );
  }
  if (!profile || profile.role !== "developer") {
    return (
      <FullScreen>
        <p className="font-label text-sm tracking-luxury text-muted-foreground">Redirecting…</p>
      </FullScreen>
    );
  }

  const signOut = async () => {
    await authClient.signOut();
    queryClient.setQueryData(ADMIN_ME_KEY, null);
    navigate({ to: "/admin/login" });
  };

  return (
    <PortalShell
      nav={NAV}
      homePath="/developer"
      portalLabel="Developer Portal"
      userLabel={profile.fullName || profile.email}
      userRole="Developer"
      onSignOut={signOut}
      title={title}
    >
      {children}
    </PortalShell>
  );
}
