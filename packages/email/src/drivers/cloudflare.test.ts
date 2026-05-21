import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Either } from "effect";
import { EmailProviderError } from "../errors.ts";
import {
  type CloudflareEmailMessageBuilder,
  type CloudflareSendEmailBinding,
  makeCloudflareEmail,
} from "./cloudflare.ts";

test("Cloudflare driver maps send input to binding message", async () => {
  const sent: CloudflareEmailMessageBuilder[] = [];
  const email = makeCloudflareEmail(makeBinding(sent), {
    defaultFrom: "noreply@templarlabs.com",
  });

  const result = await Effect.runPromise(
    email.send({
      to: "user@example.com",
      subject: "Welcome",
      html: "<p>Welcome.</p>",
      text: "Welcome.",
    }),
  );

  assert.deepEqual(result, { messageId: "cf-message-1" });
  assert.deepEqual(sent, [
    {
      from: "noreply@templarlabs.com",
      to: "user@example.com",
      subject: "Welcome",
      html: "<p>Welcome.</p>",
      text: "Welcome.",
    },
  ]);
});

test("Cloudflare driver maps named and string addresses", async () => {
  const sent: CloudflareEmailMessageBuilder[] = [];
  const email = makeCloudflareEmail(makeBinding(sent));

  await Effect.runPromise(
    email.send({
      from: { email: "noreply@templarlabs.com", name: "Templar Labs" },
      to: [{ email: "user@example.com", name: "User" }, "other@example.com"],
      subject: "Welcome",
      text: "Welcome.",
    }),
  );

  assert.deepEqual(sent[0]?.from, {
    email: "noreply@templarlabs.com",
    name: "Templar Labs",
  });
  assert.deepEqual(sent[0]?.to, ["user@example.com", "other@example.com"]);
});

test("Cloudflare driver maps cc, bcc, reply-to, headers, and attachments", async () => {
  const sent: CloudflareEmailMessageBuilder[] = [];
  const email = makeCloudflareEmail(makeBinding(sent), {
    defaultFrom: "noreply@templarlabs.com",
  });
  const content = new ArrayBuffer(8);

  await Effect.runPromise(
    email.send({
      to: "user@example.com",
      cc: "copy@example.com",
      bcc: [{ email: "blind@example.com", name: "Blind Copy" }],
      replyTo: { email: "support@templarlabs.com", name: "Support" },
      subject: "Report",
      text: "Attached.",
      headers: { "X-Trace": "trace-1" },
      attachments: [
        {
          filename: "report.txt",
          content: "report",
          contentType: "text/plain",
        },
        {
          filename: "chart.png",
          content,
          contentType: "image/png",
          disposition: "inline",
          contentId: "chart-1",
        },
      ],
    }),
  );

  assert.deepEqual(sent[0], {
    from: "noreply@templarlabs.com",
    to: "user@example.com",
    cc: "copy@example.com",
    bcc: ["blind@example.com"],
    replyTo: { email: "support@templarlabs.com", name: "Support" },
    subject: "Report",
    text: "Attached.",
    headers: { "X-Trace": "trace-1" },
    attachments: [
      {
        filename: "report.txt",
        content: "report",
        type: "text/plain",
        disposition: "attachment",
      },
      {
        filename: "chart.png",
        content,
        type: "image/png",
        disposition: "inline",
        contentId: "chart-1",
      },
    ],
  });
});

test("Cloudflare driver wraps binding failures in EmailProviderError", async () => {
  const email = makeCloudflareEmail(
    {
      send: () => Promise.reject(new Error("boom")),
    },
    {
      defaultFrom: "noreply@templarlabs.com",
    },
  );

  const result = await Effect.runPromise(
    Effect.either(
      email.send({
        to: "user@example.com",
        subject: "Welcome",
        text: "Welcome.",
      }),
    ),
  );

  if (Either.isLeft(result)) {
    const error = result.left;

    if (!(error instanceof EmailProviderError)) {
      assert.fail("Expected EmailProviderError.");
    }

    assert.equal(error.provider, "cloudflare");
    assert.equal(error.operation, "send");
    return;
  }

  assert.fail("Expected email.send to fail.");
});

function makeBinding(sent: CloudflareEmailMessageBuilder[] = []): CloudflareSendEmailBinding {
  return {
    send: (message) => {
      sent.push(message);
      return Promise.resolve({
        messageId: "cf-message-1",
      });
    },
  };
}
