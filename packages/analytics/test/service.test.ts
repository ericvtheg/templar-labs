import assert from "node:assert/strict";
import { test } from "node:test";
import { AppEnvironment } from "@templar/config";
import { Effect, Either } from "effect";
import type { AnalyticsDriver } from "../src/driver.ts";
import { AnalyticsProviderError } from "../src/errors.ts";
import { makeAnalyticsLayerFor, makeAnalyticsService, makeAnalyticsTag } from "../src/service.ts";
import type {
  AnalyticsServiceDefaults,
  ResolvedIdentifyUserInput,
  ResolvedTrackEventInput,
} from "../src/types.ts";

type TestEvents = {
  readonly "signup.completed": undefined;
  readonly "project.created": {
    readonly projectId: string;
    readonly source: "dashboard" | "template";
  };
};

type TestUserProperties = {
  readonly email?: string;
  readonly plan?: "free" | "pro";
};

test("track no-ops outside production", async () => {
  const tracked: ResolvedTrackEventInput[] = [];
  const analytics = makeAnalyticsService<TestEvents, TestUserProperties>({
    driver: makeDriver({ tracked }),
    defaults: makeDefaults({ environment: AppEnvironment.Local }),
  });

  await Effect.runPromise(
    analytics.track({
      event: "project.created",
      userId: "user_123",
      properties: {
        projectId: "project_123",
        source: "dashboard",
      },
    }),
  );

  assert.deepEqual(tracked, []);
});

test("track delegates resolved input and reserved metadata wins", async () => {
  const tracked: ResolvedTrackEventInput[] = [];
  const analytics = makeAnalyticsService<TestEvents, TestUserProperties>({
    driver: makeDriver({ tracked }),
    defaults: makeDefaults({
      defaultProperties: {
        app: "wrong-app",
        deploymentId: "deployment_123",
        environment: "local",
        projectKey: "wrong-project",
        source: "default",
      },
    }),
  });

  await Effect.runPromise(
    analytics.track({
      event: "project.created",
      userId: "user_123",
      properties: {
        app: "caller-app",
        projectId: "project_123",
        projectKey: "caller-project",
        source: "dashboard",
      } as unknown as TestEvents["project.created"],
    }),
  );

  assert.deepEqual(tracked[0], {
    event: "project.created",
    userId: "user_123",
    app: "test-app",
    projectKey: "test-project",
    environment: AppEnvironment.Prod,
    properties: {
      app: "test-app",
      deploymentId: "deployment_123",
      environment: AppEnvironment.Prod,
      projectId: "project_123",
      projectKey: "test-project",
      source: "dashboard",
    },
  });
});

test("track omits caller properties for undefined event shapes", async () => {
  const tracked: ResolvedTrackEventInput[] = [];
  const analytics = makeAnalyticsService<TestEvents, TestUserProperties>({
    driver: makeDriver({ tracked }),
    defaults: makeDefaults(),
  });

  await Effect.runPromise(
    analytics.track({
      event: "signup.completed",
      userId: "user_123",
    }),
  );

  assert.deepEqual(tracked[0]?.properties, {
    app: "test-app",
    projectKey: "test-project",
    environment: AppEnvironment.Prod,
  });
});

test("identify delegates partial user properties with reserved metadata", async () => {
  const identified: ResolvedIdentifyUserInput[] = [];
  const analytics = makeAnalyticsService<TestEvents, TestUserProperties>({
    driver: makeDriver({ identified }),
    defaults: makeDefaults(),
  });

  await Effect.runPromise(
    analytics.identify({
      userId: "user_123",
      properties: {
        plan: "pro",
      },
    }),
  );

  assert.deepEqual(identified[0], {
    userId: "user_123",
    app: "test-app",
    projectKey: "test-project",
    environment: AppEnvironment.Prod,
    properties: {
      plan: "pro",
      app: "test-app",
      projectKey: "test-project",
      environment: AppEnvironment.Prod,
    },
  });
});

test("custom analytics tags preserve typed Effect usage", async () => {
  const tracked: ResolvedTrackEventInput[] = [];
  const AppAnalytics = makeAnalyticsTag<TestEvents, TestUserProperties>("@test/Analytics");
  const analytics = makeAnalyticsService<TestEvents, TestUserProperties>({
    driver: makeDriver({ tracked }),
    defaults: makeDefaults(),
  });

  await Effect.runPromise(
    Effect.gen(function* () {
      yield* AppAnalytics.track({
        event: "project.created",
        userId: "user_123",
        properties: {
          projectId: "project_123",
          source: "template",
        },
      });
    }).pipe(Effect.provide(makeAnalyticsLayerFor(AppAnalytics, analytics))),
  );

  assert.equal(tracked[0]?.event, "project.created");
});

test("validation errors are swallowed and do not call the driver", async () => {
  const tracked: ResolvedTrackEventInput[] = [];
  const analytics = makeAnalyticsService<TestEvents, TestUserProperties>({
    driver: makeDriver({ tracked }),
    defaults: makeDefaults(),
  });

  const result = await Effect.runPromise(
    Effect.either(
      analytics.track({
        event: "project.created",
        userId: " ",
        properties: {
          projectId: "project_123",
          source: "dashboard",
        },
      }),
    ),
  );

  assert.equal(Either.isRight(result), true);
  assert.deepEqual(tracked, []);
});

test("non JSON-safe properties are swallowed and do not call the driver", async () => {
  const identified: ResolvedIdentifyUserInput[] = [];
  const analytics = makeAnalyticsService<TestEvents, TestUserProperties>({
    driver: makeDriver({ identified }),
    defaults: makeDefaults(),
  });

  const result = await Effect.runPromise(
    Effect.either(
      analytics.identify({
        userId: "user_123",
        properties: {
          email: "user@example.com",
          lastSeenAt: new Date("2026-05-21T00:00:00.000Z"),
        } as unknown as Partial<TestUserProperties>,
      }),
    ),
  );

  assert.equal(Either.isRight(result), true);
  assert.deepEqual(identified, []);
});

test("provider errors are swallowed", async () => {
  const analytics = makeAnalyticsService<TestEvents, TestUserProperties>({
    driver: {
      provider: "test",
      track: () =>
        Effect.fail(
          new AnalyticsProviderError({
            provider: "test",
            operation: "track",
            message: "Provider failed.",
          }),
        ),
      identify: () => Effect.void,
    },
    defaults: makeDefaults(),
  });

  const result = await Effect.runPromise(
    Effect.either(
      analytics.track({
        event: "signup.completed",
        userId: "user_123",
      }),
    ),
  );

  assert.equal(Either.isRight(result), true);
});

function makeDriver(values: {
  readonly tracked?: ResolvedTrackEventInput[];
  readonly identified?: ResolvedIdentifyUserInput[];
}): AnalyticsDriver {
  return {
    provider: "test",
    track: (input) =>
      Effect.sync(() => {
        values.tracked?.push(input);
      }),
    identify: (input) =>
      Effect.sync(() => {
        values.identified?.push(input);
      }),
  };
}

function makeDefaults(overrides: Partial<AnalyticsServiceDefaults> = {}): AnalyticsServiceDefaults {
  return {
    app: "test-app",
    projectKey: "test-project",
    environment: AppEnvironment.Prod,
    ...overrides,
  };
}
