import { Context, Effect, Layer, Option } from "effect";

import {
  AuthEmailConfigService,
  loadOptionalCloudflareAuthEmailConfig,
} from "./auth-email-config.js";
import type {
  AuthEmailRejectedError,
  AuthEmailRequestError,
} from "./auth-email-errors.js";
import { makeCloudflareAuthEmailTransport } from "./cloudflare-auth-email-transport.js";
import { makeCloudflareEmailBindingAuthEmailTransport } from "./cloudflare-email-binding-auth-email-transport.js";

export interface TransportMessage {
  readonly deliveryKey?: string;
  readonly html: string;
  readonly subject: string;
  readonly text: string;
  readonly to: string;
}

export type AuthEmailTransportError =
  | AuthEmailRejectedError
  | AuthEmailRequestError;

export interface AuthEmailTransportImplementation {
  readonly send: (
    message: TransportMessage
  ) => Effect.Effect<void, AuthEmailTransportError>;
}

export function makeDevelopmentAuthEmailTransport(): AuthEmailTransportImplementation {
  const send = Effect.fn("AuthEmailTransport.Development.send")(() =>
    Effect.log("Auth email transport send skipped", {
      outcomeBucket: "development",
      provider: "development",
    }).pipe(Effect.asVoid)
  );

  return { send };
}

export function makeLocalAuthEmailTransport(
  options?: Parameters<typeof makeCloudflareAuthEmailTransport>[0]
) {
  return loadOptionalCloudflareAuthEmailConfig.pipe(
    Effect.flatMap((config) =>
      Option.isNone(config)
        ? Effect.succeed(makeDevelopmentAuthEmailTransport())
        : makeCloudflareAuthEmailTransport({
            ...options,
            config: config.value,
          })
    )
  );
}

export class AuthEmailTransport extends Context.Tag(
  "@ceird/domains/identity/authentication/AuthEmailTransport"
)<AuthEmailTransport, AuthEmailTransportImplementation>() {
  static readonly send = (message: TransportMessage) =>
    Effect.gen(function* AuthEmailTransportSend() {
      const transport = yield* AuthEmailTransport;

      return yield* transport.send(message);
    });

  static readonly Development = Layer.succeed(
    AuthEmailTransport,
    makeDevelopmentAuthEmailTransport()
  );

  static readonly CloudflareApi = Layer.effect(
    AuthEmailTransport,
    makeCloudflareAuthEmailTransport()
  );

  static readonly CloudflareBinding = Layer.effect(
    AuthEmailTransport,
    makeCloudflareEmailBindingAuthEmailTransport()
  ).pipe(Layer.provide(AuthEmailConfigService.Default));

  static readonly Local = Layer.effect(
    AuthEmailTransport,
    makeLocalAuthEmailTransport()
  );
}
