import { PostHog } from "posthog-node";

let posthogClient: PostHog | null = null;

export function getPostHogClient(): PostHog | null {
  const token =
    process.env["VITE_PUBLIC_POSTHOG_PROJECT_TOKEN"] ||
    import.meta.env["VITE_PUBLIC_POSTHOG_PROJECT_TOKEN"];
  const host =
    process.env["VITE_PUBLIC_POSTHOG_HOST"] || import.meta.env["VITE_PUBLIC_POSTHOG_HOST"];

  if (!token || !host) {
    if (import.meta.env["DEV"]) {
      console.error(
        "VITE_PUBLIC_POSTHOG_PROJECT_TOKEN or VITE_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once these variables are configured",
      );
    }
    return null;
  }

  if (!posthogClient) {
    posthogClient = new PostHog(token, {
      host,
      flushAt: 1,
      flushInterval: 0,
    });
  }

  return posthogClient;
}
