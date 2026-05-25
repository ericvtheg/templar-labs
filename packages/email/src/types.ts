import type { AppEnvironment } from "@templar/config";

export type EmailAddress =
  | string
  | {
      readonly email: string;
      readonly name?: string;
    };

export type EmailAttachment = {
  readonly filename: string;
  readonly content: string | ArrayBuffer;
  readonly contentType: string;
  readonly disposition?: "attachment" | "inline";
  readonly contentId?: string;
};

export type SendEmailInput = {
  readonly from?: EmailAddress;
  readonly to: EmailAddress | ReadonlyArray<EmailAddress>;
  readonly subject: string;
  readonly html?: string;
  readonly text?: string;
  readonly cc?: EmailAddress | ReadonlyArray<EmailAddress>;
  readonly bcc?: EmailAddress | ReadonlyArray<EmailAddress>;
  readonly replyTo?: EmailAddress;
  readonly headers?: Readonly<Record<string, string>>;
  readonly attachments?: ReadonlyArray<EmailAttachment>;
};

export type ResolvedSendEmailInput = SendEmailInput & {
  readonly from: EmailAddress;
};

export type SendEmailResult = {
  readonly messageId: string;
  readonly status?: "sent" | "skipped";
};

export type EmailServiceDefaults = {
  readonly app?: string;
  readonly environment: AppEnvironment;
  readonly defaultFrom?: EmailAddress;
  readonly defaultReplyTo?: EmailAddress;
  readonly defaultHeaders?: Readonly<Record<string, string>>;
};
