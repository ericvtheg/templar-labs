import assert from "node:assert/strict";
import { test } from "node:test";
import { AppEnvironment } from "@templar/config";
import { Effect } from "effect";
import { makePostHogAnalyticsProvider } from "../src/drivers/posthog.ts";

type TestEvents = {
  readonly "project.created": {
    readonly projectId: string;
  };
};

type TestUserProperties = {
  readonly email?: string;
};

test("posthog track serializes capture request", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const provider = makePostHogAnalyticsProvider({
    host: "https://posthog.example.internal/",
    projectApiKey: "ph_project_key",
    fetch: (url, init) => {
      requestUrl = String(url);
      requestInit = init;

      return Promise.resolve(Response.json({ ok: true }));
    },
  });
  const analytics = provider.makeAnalytics<TestEvents, TestUserProperties>({
    app: "test-app",
    projectKey: "test-project",
    environment: AppEnvironment.Prod,
  });

  await Effect.runPromise(
    analytics.track({
      event: "project.created",
      userId: "user_123",
      properties: {
        projectId: "project_123",
      },
    }),
  );

  assert.equal(requestUrl, "https://posthog.example.internal/capture/");
  assert.equal(requestInit?.method, "POST");
  assert.equal(new Headers(requestInit?.headers).get("content-type"), "application/json");
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    api_key: "ph_project_key",
    event: "project.created",
    distinct_id: "user_123",
    properties: {
      projectId: "project_123",
      app: "test-app",
      projectKey: "test-project",
      environment: AppEnvironment.Prod,
    },
  });
});

test("posthog identify serializes identity update request", async () => {
  let requestInit: RequestInit | undefined;
  const provider = makePostHogAnalyticsProvider({
    host: "https://posthog.example.internal",
    projectApiKey: "ph_project_key",
    fetch: (_url, init) => {
      requestInit = init;

      return Promise.resolve(Response.json({ ok: true }));
    },
  });
  const analytics = provider.makeAnalytics<TestEvents, TestUserProperties>({
    app: "test-app",
    projectKey: "test-project",
    environment: AppEnvironment.Prod,
  });

  await Effect.runPromise(
    analytics.identify({
      userId: "user_123",
      properties: {
        email: "user@example.com",
      },
    }),
  );

  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    api_key: "ph_project_key",
    event: "$identify",
    distinct_id: "user_123",
    properties: {
      email: "user@example.com",
      app: "test-app",
      projectKey: "test-project",
      environment: AppEnvironment.Prod,
      $set: {
        email: "user@example.com",
        app: "test-app",
        projectKey: "test-project",
        environment: AppEnvironment.Prod,
      },
    },
  });
});

test("posthog HTTP errors are swallowed by the service", async () => {
  const provider = makePostHogAnalyticsProvider({
    host: "https://posthog.example.internal",
    projectApiKey: "ph_project_key",
    fetch: () =>
      Promise.resolve(
        Response.json(
          {
            detail: "Invalid request",
          },
          { status: 400 },
        ),
      ),
  });
  const analytics = provider.makeAnalytics<TestEvents, TestUserProperties>({
    app: "test-app",
    projectKey: "test-project",
    environment: AppEnvironment.Prod,
  });

  await Effect.runPromise(
    analytics.track({
      event: "project.created",
      userId: "user_123",
      properties: {
        projectId: "project_123",
      },
    }),
  );
});
