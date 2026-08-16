let initialized = false;

async function sentry() {
  if (!process.env.SENTRY_DSN) return null;
  const Sentry = await import("@sentry/node");
  if (!initialized) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.APP_ENV ?? process.env.NODE_ENV,
      release: process.env.RELEASE_SHA,
      sendDefaultPii: false,
      beforeSend(event) {
        delete event.request?.data;
        delete event.request?.cookies;
        delete event.user;
        event.breadcrumbs = [];
        return event;
      },
    });
    initialized = true;
  }
  return Sentry;
}

export async function reportServerIncident(incidentId: string, category: string) {
  const Sentry = await sentry();
  if (!Sentry) return;
  Sentry.captureMessage("PropCompare server incident", {
    level: "error",
    tags: { incidentId, category },
  });
}
