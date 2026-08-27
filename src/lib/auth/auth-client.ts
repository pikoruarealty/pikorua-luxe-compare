import { createAuthClient } from "better-auth/client";
import { twoFactorClient } from "better-auth/client/plugins";

// No baseURL: same-origin, browser requests to /api/auth/* resolve relative
// to the current page automatically.
export const authClient = createAuthClient({
  plugins: [twoFactorClient()],
});
