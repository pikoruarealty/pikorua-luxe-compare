import { defineConfig } from "vitest/config";
import tsConfigPaths from "vite-tsconfig-paths";

// Vitest deliberately does NOT load the tanstackStart plugin. These are unit
// tests over server-side modules, so the SSR router and the client/server
// import protection would only get in the way — the "@/" alias is the one piece
// of the app's Vite setup they actually need.
//
// `bun run check` (the three assertion scripts under scripts/) stays as it is.
// This runner exists for the things those scripts cannot express: anything
// needing a stubbed fetch, a fake clock, or a forged cookie.
export default defineConfig({
  plugins: [tsConfigPaths({ projects: ["./tsconfig.json"] })],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Server functions read process.env at call time; a leaked value from one
    // test file must not decide another's outcome.
    isolate: true,
    restoreMocks: true,
    unstubEnvs: true,
  },
});
