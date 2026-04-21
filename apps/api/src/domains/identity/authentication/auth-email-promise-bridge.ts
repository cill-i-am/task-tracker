import { Context, Effect, Layer, Runtime } from "effect";

import { AuthEmailSender } from "./auth-email.js";
import type {
  EmailVerificationEmailInput,
  OrganizationInvitationEmailInput,
  PasswordResetEmailInput,
} from "./auth-email.js";
import { CloudflareAuthEmailTransportLive } from "./cloudflare-auth-email-transport.js";

// The auth domain depends on the sender service; the concrete Cloudflare
// transport stays injected at this infrastructure edge.
const AuthenticationEmailSenderLive = Layer.provide(AuthEmailSender.Default, [
  CloudflareAuthEmailTransportLive,
]);

export class AuthEmailPromiseBridge extends Context.Tag(
  "@task-tracker/domains/identity/authentication/AuthEmailPromiseBridge"
)<
  AuthEmailPromiseBridge,
  {
    readonly sendEmailVerificationEmail: (
      input: EmailVerificationEmailInput
    ) => Promise<void>;
    readonly sendOrganizationInvitationEmail: (
      input: OrganizationInvitationEmailInput
    ) => Promise<void>;
    readonly send: (input: PasswordResetEmailInput) => Promise<void>;
  }
>() {}

export const AuthEmailPromiseBridgeLive = Layer.effect(
  AuthEmailPromiseBridge,
  Effect.gen(function* AuthEmailPromiseBridgeLive() {
    const runtime = yield* Effect.runtime<AuthEmailSender>();
    const runPromise = Runtime.runPromise(runtime);

    return {
      sendEmailVerificationEmail: (input: EmailVerificationEmailInput) =>
        runPromise(AuthEmailSender.sendEmailVerificationEmail(input)),
      sendOrganizationInvitationEmail: (
        input: OrganizationInvitationEmailInput
      ) => runPromise(AuthEmailSender.sendOrganizationInvitationEmail(input)),
      send: (input: PasswordResetEmailInput) =>
        runPromise(AuthEmailSender.sendPasswordResetEmail(input)),
    };
  })
).pipe(Layer.provide(AuthenticationEmailSenderLive));
