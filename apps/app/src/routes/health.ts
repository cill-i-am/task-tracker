import { createFileRoute } from "@tanstack/react-router";
import { makeHealthPayloadFromSandboxIdInput } from "@task-tracker/sandbox-core";
import { Config, Effect } from "effect";

const HealthConfig = Config.all({
  sandboxId: Config.string("SANDBOX_ID").pipe(
    Config.withDefault("000000000000")
  ),
}).pipe(Effect.orDie);

export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: async () => {
        const { sandboxId } = await Effect.runPromise(HealthConfig);

        return Response.json(
          makeHealthPayloadFromSandboxIdInput("app", sandboxId)
        );
      },
    },
  },
});
