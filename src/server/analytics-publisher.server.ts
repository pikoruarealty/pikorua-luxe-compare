import { randomUUID } from "node:crypto";
import { PubSub } from "@google-cloud/pubsub";

interface ProductEvent {
  event: string;
  profileId: string | null;
  anonymousSessionId: string | null;
  propertySlug: string | null;
  metadata: Record<string, unknown>;
}

let client: PubSub | null = null;

export async function publishProductEvent(event: ProductEvent) {
  const topic = process.env.ANALYTICS_PUBSUB_TOPIC;
  const projectId = process.env.GCP_PROJECT_ID;
  if (!topic || !projectId) throw new Error("Product analytics pipeline is not configured");
  client ??= new PubSub({ projectId });
  await client.topic(topic).publishMessage({
    json: {
      schemaVersion: 1,
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      eventName: event.event,
      profileId: event.profileId,
      anonymousSessionId: event.anonymousSessionId,
      propertySlug: event.propertySlug,
      metadata: event.metadata,
    },
    attributes: { schemaVersion: "1", eventName: event.event },
  });
}
