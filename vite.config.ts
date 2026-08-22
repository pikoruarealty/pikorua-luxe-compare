import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

// Standard TanStack Start + Nitro setup. Vite natively injects
// `import.meta.env.VITE_*` from .env, and vite-tsconfig-paths resolves the
// "@/" alias from tsconfig.json — so `npm run dev` serves on
// http://localhost:5173 with no extra tooling.
export default defineConfig(async ({ command }) => {
  const plugins = [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // Route the server build through src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
      // Keep server-only modules out of the client bundle.
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
    viteReact(),
  ];

  // Nitro produces the deployable server output at build time only. Deploy
  // target is a GCP VM (Dockerfile sets NITRO_PRESET=node-server); the
  // Vercel/Cloudflare fallbacks below only matter for a bare local build.
  if (command === "build") {
    const { nitro } = await import("nitro/vite");
    plugins.push(
      nitro({
        preset: process.env.VERCEL ? "vercel" : process.env.NITRO_PRESET || "cloudflare-module",
      }),
    );
  }

  return {
    // host: true binds to 0.0.0.0 so a colleague on the same LAN can reach
    // this dev server, not just localhost.
    server: { port: 5173, host: true },
    resolve: {
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    plugins,
  };
});
