import { AppEnvironment } from "@templar/config";
import { Context, Effect, Layer } from "effect";
import type { EmailDriver } from "./driver.ts";
import { type EmailError, EmailValidationError } from "./errors.ts";
import { withEmailLogging } from "./logging.ts";
import type {
  EmailAddress,
  EmailServiceDefaults,
  ResolvedSendEmailInput,
  SendEmailInput,
  SendEmailResult,
} from "./types.ts";

export type EmailService = {
  readonly send: (input: SendEmailInput) => Effect.Effect<SendEmailResult, EmailError>;
};

export class Email extends Context.Tag("@templar/email/Email")<Email, EmailService>() {
  static readonly send = Effect.serviceFunctionEffect(this, (email) => email.send);
}

export function makeEmailLayer(service: EmailService): Layer.Layer<Email> {
  return Layer.succeed(Email, service);
}

export function makeEmailService(input: {
  readonly provider: string;
  readonly driver: EmailDriver;
  readonly defaults: EmailServiceDefaults;
}): EmailService {
  const service: EmailService =
    input.defaults.environment === AppEnvironment.Prod
      ? {
          send: makeSend(input.driver.send, input.defaults),
        }
      : {
          send: () => Effect.succeed(disabledSendResult(input.defaults.environment)),
        };

  return input.defaults.environment === AppEnvironment.Prod
    ? withEmailServiceLogging(input.provider, input.defaults, service)
    : service;
}

function makeSend(send: EmailDriver["send"], defaults: EmailServiceDefaults): EmailService["send"] {
  return (input: SendEmailInput) =>
    Effect.flatMap(resolveSendInput(input, defaults), (resolved) => send(resolved));
}

function disabledSendResult(environment: EmailServiceDefaults["environment"]): SendEmailResult {
  return {
    messageId: `email-disabled-${environment}`,
    status: "skipped",
  };
}

function resolveSendInput(
  input: SendEmailInput,
  defaults: EmailServiceDefaults,
): Effect.Effect<ResolvedSendEmailInput, EmailValidationError> {
  const from = input.from ?? defaults.defaultFrom;
  const replyTo = input.replyTo ?? defaults.defaultReplyTo;
  const headers = resolveHeaders(input.headers, defaults);

  return Effect.flatMap(validateSendInput(input, from), () =>
    Effect.succeed({
      ...input,
      from: from as EmailAddress,
      ...(replyTo === undefined ? {} : { replyTo }),
      ...(headers === undefined ? {} : { headers }),
    }),
  );
}

function resolveHeaders(
  headers: Readonly<Record<string, string>> | undefined,
  defaults: EmailServiceDefaults,
): Readonly<Record<string, string>> | undefined {
  const resolved = {
    ...defaults.defaultHeaders,
    ...(defaults.app === undefined ? {} : { "X-Templar-App": defaults.app }),
    ...headers,
  };

  return Object.keys(resolved).length === 0 ? undefined : resolved;
}

function validateSendInput(
  input: SendEmailInput,
  from: EmailAddress | undefined,
): Effect.Effect<void, EmailValidationError> {
  if (from === undefined) {
    return validationFailure("from", "Email sender is required.");
  }

  if (emailAddressList(input.to).length === 0) {
    return validationFailure("to", "At least one email recipient is required.");
  }

  if (input.subject.trim().length === 0) {
    return validationFailure("subject", "Email subject is required.");
  }

  if (isEmptyBody(input.html) && isEmptyBody(input.text)) {
    return validationFailure("body", "Email html or text body is required.");
  }

  const invalidAttachment = input.attachments?.find(
    (attachment) =>
      attachment.filename.trim().length === 0 || attachment.contentType.trim().length === 0,
  );

  if (invalidAttachment !== undefined) {
    return validationFailure(
      "attachments",
      "Email attachment filenames and content types are required.",
    );
  }

  return Effect.void;
}

function emailAddressList(
  addresses: EmailAddress | ReadonlyArray<EmailAddress>,
): ReadonlyArray<EmailAddress> {
  return Array.isArray(addresses) ? addresses : [addresses as EmailAddress];
}

function isEmptyBody(body: string | undefined): boolean {
  return body === undefined || body.trim().length === 0;
}

function validationFailure(
  field: string,
  message: string,
): Effect.Effect<never, EmailValidationError> {
  return Effect.fail(
    new EmailValidationError({
      field,
      message,
    }),
  );
}

function withEmailServiceLogging(
  provider: string,
  defaults: EmailServiceDefaults,
  service: EmailService,
): EmailService {
  return {
    send: (input: SendEmailInput) =>
      service.send(input).pipe(
        withEmailLogging({
          provider,
          operation: "send",
          environment: defaults.environment,
          ...(defaults.app === undefined ? {} : { app: defaults.app }),
        }),
      ),
  };
}
