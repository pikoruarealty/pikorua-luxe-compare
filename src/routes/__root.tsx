import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { propertiesQueryOptions } from "@/api/queries/properties.queries";
import { PropertiesProvider } from "../context/PropertiesContext";
import { OnboardingProvider } from "../context/OnboardingContext";
import { OnboardingOverlay } from "../components/onboarding/OnboardingOverlay";
import { ScrollProgress } from "@/components/layout/ScrollProgress";
import { AdvisorPill } from "@/components/layout/AdvisorPill";
import { PageFade } from "@/components/layout/PageFade";
import { ThemeProvider } from "../context/ThemeContext";
import { getCatalogueBootstrap } from "@/api/functions/catalogue-bootstrap.functions";
import { SITE_URL, absoluteUrl } from "@/lib/site";

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
      { title: "PropCompare — Compare. Decide. Confidently." },
      {
        name: "description",
        content:
          "Compare ultra-luxury residences side by side and decide with clarity — configurations, pricing, RERA and possession, all in one view.",
      },
      { property: "og:title", content: "PropCompare — Compare. Decide. Confidently." },
      {
        property: "og:description",
        content: "Compare ultra-luxury residences side by side.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "PropCompare" },
      { property: "og:url", content: SITE_URL },
      // `summary_large_image` was already declared but had no image behind it,
      // so every share rendered as a bare text card.
      { property: "og:image", content: absoluteUrl("/og-image.jpg") },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content: "Two Ahmedabad residential towers at dusk, side by side",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: absoluteUrl("/og-image.jpg") },
      { name: "theme-color", content: "#ffffff" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        // One stylesheet request for all three families, so the two preconnects
        // above still cover the whole font load. Instrument Serif is landing-page
        // display type and ships at 400 only — see --font-landing in styles.css.
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Plus+Jakarta+Sans:ital,wght@0,500;0,600;0,700;0,800;1,600;1,700&family=Instrument+Serif:ital@0;1&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "alternate icon", href: "/favicon-96.png", sizes: "96x96" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  // The property catalog now lives in the database. Loading it here (once per
  // document request) keeps every consumer synchronous via PropertiesProvider
  // and puts the data in the SSR payload, so there's no first-paint flash.
  loader: async ({ context }) => {
    const v2 = await getCatalogueBootstrap();
    return {
      properties: v2.enabled
        ? []
        : await context.queryClient.ensureQueryData(propertiesQueryOptions()),
    };
  },
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
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
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
            <div id="main-content" tabIndex={-1}>
              <PageFade>
                <Outlet />
              </PageFade>
            </div>
            <AdvisorPill />
            <OnboardingOverlay />
            <Toaster
              position="top-center"
              visibleToasts={1}
              duration={2000}
              toastOptions={{
                duration: 2000,
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
