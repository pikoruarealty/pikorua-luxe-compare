import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { propertiesQueryOptions } from "../lib/properties.queries";
import { PropertiesProvider } from "../context/PropertiesContext";
import { OnboardingProvider } from "../context/OnboardingContext";
import { OnboardingOverlay } from "../components/onboarding/OnboardingOverlay";
import { ScrollProgress } from "../components/ScrollProgress";
import { AdvisorPill } from "../components/AdvisorPill";
import { PageFade } from "../components/PageFade";
import { ThemeProvider } from "../context/ThemeContext";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl gold-text">404</h1>
        <h2 className="mt-4 font-display text-xl text-ivory">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The residence you're looking for doesn't exist in our portfolio.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-champagne to-muted-gold px-6 py-3 text-xs tracking-luxury text-lux-black"
          >
            Browse Residences
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-xl text-ivory">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">Something went wrong. Try again.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-full bg-champagne px-5 py-2.5 text-xs tracking-luxury text-lux-black"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-full gold-border px-5 py-2.5 text-xs tracking-luxury text-ivory"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "PIKORUA — Luxury Property Consultant" },
      {
        name: "description",
        content:
          "Compare ultra-luxury residences side by side. Curated by Pikorua's private-client advisory.",
      },
      { property: "og:title", content: "PIKORUA — Luxury Property Consultant" },
      {
        property: "og:description",
        content: "Compare ultra-luxury residences side by side.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Plus+Jakarta+Sans:ital,wght@0,500;0,600;0,700;0,800;1,600;1,700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  // The property catalog now lives in the database. Loading it here (once per
  // document request) keeps every consumer synchronous via PropertiesProvider
  // and puts the data in the SSR payload, so there's no first-paint flash.
  loader: async ({ context }) => ({
    properties: await context.queryClient.ensureQueryData(propertiesQueryOptions()),
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    // Server-render the default theme so the first paint is already pure
    // white/black; ThemeProvider reconciles with localStorage after mount.
    <html lang="en" className="light" data-palette="bright" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { properties } = Route.useLoaderData();
  return (
    <QueryClientProvider client={queryClient}>
      <PropertiesProvider properties={properties}>
        <ThemeProvider>
          <OnboardingProvider>
            <ScrollProgress />
            <PageFade>
              <Outlet />
            </PageFade>
            <AdvisorPill />
            <OnboardingOverlay />
            <Toaster
              position="top-center"
              toastOptions={{
                style: {
                  background: "var(--popover)",
                  border: "1px solid var(--glass-border)",
                  color: "var(--popover-foreground)",
                  backdropFilter: "blur(20px)",
                },
              }}
            />
          </OnboardingProvider>
        </ThemeProvider>
      </PropertiesProvider>
    </QueryClientProvider>
  );
}
