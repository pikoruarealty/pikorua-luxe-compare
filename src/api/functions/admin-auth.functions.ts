import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export interface AdminProfileDTO {
  id: string;
  role: "owner" | "reviewer" | "support" | "developer";
  email: string;
  fullName: string | null;
  isActive: boolean;
  twoFactorEnabled: boolean;
}

export const getCurrentAdminProfile = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminProfileDTO | null> => {
    try {
      const request = getRequest();
      if (!request?.headers) return null;

      const { auth } = await import("@/lib/auth/auth.server");
      const result = await auth.api.getSession({ headers: request.headers });
      if (!result) return null;

      const { getAdminProfileById } =
        await import("@/repositories/admin-profile.repository.server");
      const data = await getAdminProfileById(result.user.id);
      if (!data || !data.isActive) return null;
      if (!["owner", "reviewer", "support", "developer"].includes(data.role)) return null;

      return {
        id: data.id,
        role: data.role as AdminProfileDTO["role"],
        email: data.email,
        fullName: data.fullName,
        isActive: data.isActive,
        twoFactorEnabled: result.user.twoFactorEnabled ?? false,
      };
    } catch {
      return null;
    }
  },
);
