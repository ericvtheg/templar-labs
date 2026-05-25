import { Effect } from "effect";
import type { EmailDriver } from "../driver.ts";
import { EmailProviderError } from "../errors.ts";
import { type EmailService, makeEmailLayer, makeEmailService } from "../service.ts";
import type {
  EmailAddress,
  EmailAttachment,
  EmailServiceDefaults,
  ResolvedSendEmailInput,
  SendEmailResult,
} from "../types.ts";

export type CloudflareEmailAddress = string | { readonly email: string; readonly name?: string };
export type CloudflareEmailRecipient = string;

export type CloudflareEmailAttachment = {
  readonly filename: string;
  readonly content: string | ArrayBuffer;
  readonly type: string;
  readonly disposition: "attachment" | "inline";
  readonly contentId?: string;
};

export type CloudflareEmailMessageBuilder = {
  readonly from: CloudflareEmailAddress;
  readonly to: CloudflareEmailRecipient | ReadonlyArray<CloudflareEmailRecipient>;
  readonly subject: string;
  readonly html?: string;
  readonly text?: string;
  readonly cc?: CloudflareEmailRecipient | ReadonlyArray<CloudflareEmailRecipient>;
  readonly bcc?: CloudflareEmailRecipient | ReadonlyArray<CloudflareEmailRecipient>;
  readonly replyTo?: CloudflareEmailAddress;
  readonly headers?: Readonly<Record<string, string>>;
  readonly attachments?: ReadonlyArray<CloudflareEmailAttachment>;
};

export type CloudflareEmailSendResult = {
  readonly messageId: string;
};

export type CloudflareSendEmailBinding = {
  readonly send: (message: CloudflareEmailMessageBuilder) => Promise<CloudflareEmailSendResult>;
};

export function makeCloudflareEmail(
  binding: CloudflareSendEmailBinding,
  defaults: EmailServiceDefaults,
): EmailService {
  const driver = {
    send: (input: ResolvedSendEmailInput) => sendCloudflareEmail(binding, input),
  } satisfies EmailDriver;

  return makeEmailService({
    provider: "cloudflare",
    driver,
    defaults,
  });
}

export const makeEmail = makeCloudflareEmail;

export function cloudflareEmailLayer(
  binding: CloudflareSendEmailBinding,
  defaults: EmailServiceDefaults,
) {
  return makeEmailLayer(makeCloudflareEmail(binding, defaults));
}

export const emailLayer = cloudflareEmailLayer;

function sendCloudflareEmail(
  binding: CloudflareSendEmailBinding,
  input: ResolvedSendEmailInput,
): Effect.Effect<SendEmailResult, EmailProviderError> {
  return Effect.tryPromise({
    try: () => binding.send(cloudflareMessage(input)).then(normalizeSendResult),
    catch: (cause) =>
      new EmailProviderError({
        provider: "cloudflare",
        operation: "send",
        message: "Cloudflare email send failed.",
        cause,
      }),
  });
}

function cloudflareMessage(input: ResolvedSendEmailInput): CloudflareEmailMessageBuilder {
  return {
    from: cloudflareAddress(input.from),
    to: cloudflareRecipientList(input.to),
    subject: input.subject,
    ...(input.html === undefined ? {} : { html: input.html }),
    ...(input.text === undefined ? {} : { text: input.text }),
    ...(input.cc === undefined ? {} : { cc: cloudflareRecipientList(input.cc) }),
    ...(input.bcc === undefined ? {} : { bcc: cloudflareRecipientList(input.bcc) }),
    ...(input.replyTo === undefined ? {} : { replyTo: cloudflareAddress(input.replyTo) }),
    ...(input.headers === undefined ? {} : { headers: input.headers }),
    ...(input.attachments === undefined
      ? {}
      : { attachments: input.attachments.map(cloudflareAttachment) }),
  };
}

function cloudflareRecipientList(
  addresses: EmailAddress | ReadonlyArray<EmailAddress>,
): CloudflareEmailRecipient | ReadonlyArray<CloudflareEmailRecipient> {
  return Array.isArray(addresses)
    ? addresses.map(cloudflareRecipient)
    : cloudflareRecipient(addresses as EmailAddress);
}

function cloudflareAddress(address: EmailAddress): CloudflareEmailAddress {
  return typeof address === "string"
    ? address
    : {
        email: address.email,
        ...(address.name === undefined ? {} : { name: address.name }),
      };
}

function cloudflareRecipient(address: EmailAddress): CloudflareEmailRecipient {
  return typeof address === "string" ? address : address.email;
}

function cloudflareAttachment(attachment: EmailAttachment): CloudflareEmailAttachment {
  return {
    filename: attachment.filename,
    content: attachment.content,
    type: attachment.contentType,
    disposition: attachment.disposition ?? "attachment",
    ...(attachment.contentId === undefined ? {} : { contentId: attachment.contentId }),
  };
}

function normalizeSendResult(result: CloudflareEmailSendResult): SendEmailResult {
  return {
    messageId: result.messageId,
  };
}
