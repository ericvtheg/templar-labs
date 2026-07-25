import assert from "node:assert/strict";
import { test } from "node:test";
import { AppEnvironment } from "@templar/config";
import { Effect, Either } from "effect";
import type { EmailDriver } from "../src/driver.ts";
import { EmailProviderError, EmailValidationError } from "../src/errors.ts";
import { makeEmailService } from "../src/service.ts";
import type {
  EmailServiceDefaults,
  ResolvedSendEmailInput,
  SendEmailResult,
} from "../src/types.ts";

test("send no-ops outside production", async () => {
  const sent: ResolvedSendEmailInput[] = [];
  const email = makeEmailService({
    provider: "test",
    driver: makeDriver(sent),
    defaults: {
      environment: AppEnvironment.Local,
    },
  });

  const result = await Effect.runPromise(
    email.send({
      to: [],
      subject: " ",
      text: " ",
    }),
  );

  assert.deepEqual(result, {
    messageId: "email-disabled-local",
    status: "skipped",
  });
  assert.deepEqual(sent, []);
});

test("send applies defaultFrom", async () => {
  const sent: ResolvedSendEmailInput[] = [];
  const email = makeEmailService({
    provider: "test",
    driver: makeDriver(sent),
    defaults: prodDefaults({
      defaultFrom: "noreply@templarlabs.com",
    }),
  });

  await Effect.runPromise(email.send(validInput()));

  assert.equal(sent[0]?.from, "noreply@templarlabs.com");
});

test("send allows per-send from override", async () => {
  const sent: ResolvedSendEmailInput[] = [];
  const email = makeEmailService({
    provider: "test",
    driver: makeDriver(sent),
    defaults: prodDefaults({
      defaultFrom: "noreply@templarlabs.com",
    }),
  });

  await Effect.runPromise(email.send({ ...validInput(), from: "app@templarlabs.com" }));

  assert.equal(sent[0]?.from, "app@templarlabs.com");
});

test("send applies defaultReplyTo", async () => {
  const sent: ResolvedSendEmailInput[] = [];
  const email = makeEmailService({
    provider: "test",
    driver: makeDriver(sent),
    defaults: prodDefaults({
      defaultFrom: "noreply@templarlabs.com",
      defaultReplyTo: "support@templarlabs.com",
    }),
  });

  await Effect.runPromise(email.send(validInput()));

  assert.equal(sent[0]?.replyTo, "support@templarlabs.com");
});

test("send merges default headers with send headers", async () => {
  const sent: ResolvedSendEmailInput[] = [];
  const email = makeEmailService({
    provider: "test",
    driver: makeDriver(sent),
    defaults: prodDefaults({
      defaultFrom: "noreply@templarlabs.com",
      defaultHeaders: {
        "X-Default": "default",
        "X-Override": "default",
      },
    }),
  });

  await Effect.runPromise(
    email.send({
      ...validInput(),
      headers: {
        "X-Override": "send",
        "X-Send": "send",
      },
    }),
  );

  assert.deepEqual(sent[0]?.headers, {
    "X-Default": "default",
    "X-Override": "send",
    "X-Send": "send",
  });
});

test("send adds X-Templar-App when app is configured", async () => {
  const sent: ResolvedSendEmailInput[] = [];
  const email = makeEmailService({
    provider: "test",
    driver: makeDriver(sent),
    defaults: prodDefaults({
      app: "hello-world",
      defaultFrom: "noreply@templarlabs.com",
    }),
  });

  await Effect.runPromise(email.send(validInput()));

  assert.deepEqual(sent[0]?.headers, {
    "X-Templar-App": "hello-world",
  });
});

test("send rejects missing sender after defaults", async () => {
  const email = makeEmailService({
    provider: "test",
    driver: makeDriver(),
    defaults: prodDefaults(),
  });

  const result = await Effect.runPromise(Effect.either(email.send(validInput())));

  assertValidationFailure(result, "from");
});

test("send rejects empty recipient list", async () => {
  const email = makeEmailService({
    provider: "test",
    driver: makeDriver(),
    defaults: prodDefaults({ defaultFrom: "noreply@templarlabs.com" }),
  });

  const result = await Effect.runPromise(Effect.either(email.send({ ...validInput(), to: [] })));

  assertValidationFailure(result, "to");
});

test("send rejects empty subject", async () => {
  const email = makeEmailService({
    provider: "test",
    driver: makeDriver(),
    defaults: prodDefaults({ defaultFrom: "noreply@templarlabs.com" }),
  });

  const result = await Effect.runPromise(
    Effect.either(email.send({ ...validInput(), subject: "  " })),
  );

  assertValidationFailure(result, "subject");
});

test("send rejects missing body", async () => {
  const email = makeEmailService({
    provider: "test",
    driver: makeDriver(),
    defaults: prodDefaults({ defaultFrom: "noreply@templarlabs.com" }),
  });

  const result = await Effect.runPromise(
    Effect.either(email.send({ ...validInput(), text: "  " })),
  );

  assertValidationFailure(result, "body");
});

test("send rejects invalid attachments", async () => {
  const email = makeEmailService({
    provider: "test",
    driver: makeDriver(),
    defaults: prodDefaults({ defaultFrom: "noreply@templarlabs.com" }),
  });

  const result = await Effect.runPromise(
    Effect.either(
      email.send({
        ...validInput(),
        attachments: [{ filename: "", content: "report", contentType: "text/plain" }],
      }),
    ),
  );

  assertValidationFailure(result, "attachments");
});

test("send delegates normalized input to driver", async () => {
  const sent: ResolvedSendEmailInput[] = [];
  const email = makeEmailService({
    provider: "test",
    driver: makeDriver(sent),
    defaults: prodDefaults({
      defaultFrom: { email: "noreply@templarlabs.com", name: "Templar Labs" },
    }),
  });

  await Effect.runPromise(
    email.send({
      to: ["user@example.com"],
      subject: "Welcome",
      text: "Welcome.",
    }),
  );

  assert.deepEqual(sent[0], {
    from: { email: "noreply@templarlabs.com", name: "Templar Labs" },
    to: ["user@example.com"],
    subject: "Welcome",
    text: "Welcome.",
  });
});

test("send returns driver result unchanged", async () => {
  const email = makeEmailService({
    provider: "test",
    driver: makeDriver(),
    defaults: prodDefaults({ defaultFrom: "noreply@templarlabs.com" }),
  });

  const result = await Effect.runPromise(email.send(validInput()));

  assert.deepEqual(result, { messageId: "message-1" });
});

test("send propagates provider failures", async () => {
  const email = makeEmailService({
    provider: "test",
    driver: {
      send: () =>
        Effect.fail(
          new EmailProviderError({
            provider: "test",
            operation: "send",
            message: "Send failed.",
          }),
        ),
    },
    defaults: prodDefaults({ defaultFrom: "noreply@templarlabs.com" }),
  });

  const result = await Effect.runPromise(Effect.either(email.send(validInput())));

  if (Either.isLeft(result)) {
    const error = result.left;

    if (!(error instanceof EmailProviderError)) {
      assert.fail("Expected EmailProviderError.");
    }

    return;
  }

  assert.fail("Expected email.send to fail.");
});

function validInput() {
  return {
    to: "user@example.com",
    subject: "Welcome",
    text: "Welcome.",
  };
}

function prodDefaults(defaults: Omit<EmailServiceDefaults, "environment"> = {}) {
  return {
    environment: AppEnvironment.Prod,
    ...defaults,
  };
}

function makeDriver(sent: ResolvedSendEmailInput[] = []): EmailDriver {
  return {
    send: (input) =>
      Effect.sync(() => {
        sent.push(input);
        return makeSendResult();
      }),
  };
}

function makeSendResult(): SendEmailResult {
  return {
    messageId: "message-1",
  };
}

function assertValidationFailure(
  result: Either.Either<SendEmailResult, EmailValidationError | EmailProviderError>,
  field: string,
): void {
  if (Either.isLeft(result)) {
    const error = result.left;

    if (!(error instanceof EmailValidationError)) {
      throw new Error("Expected EmailValidationError.");
    }

    if (error.field !== field) {
      throw new Error(`Expected validation field ${field}, received ${error.field}.`);
    }

    return;
  }

  throw new Error("Expected email.send to fail.");
}
