export { emailLayer, makeEmail } from "./drivers/cloudflare.ts";
export type { EmailError } from "./errors.ts";
export { EmailProviderError, EmailValidationError } from "./errors.ts";
export { Email, type EmailService } from "./service.ts";
export type {
  EmailAddress,
  EmailAttachment,
  EmailServiceDefaults,
  SendEmailInput,
  SendEmailResult,
} from "./types.ts";
