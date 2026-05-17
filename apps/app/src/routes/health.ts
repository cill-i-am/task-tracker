import { createFileRoute } from "@tanstack/react-router";
import { Config, Effect } from "effect";

const AppRuntimeConfig = Config.all({
  stage: Config.string("ALCHEMY_STAGE").pipe(Config.withDefault("local")),
}).pipe(Effect.orDie);

export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: async () => {
        const payload = await AppRuntimeConfig.pipe(
          Effect.map(({ stage }) => ({
            ok: true,
            service: "app",
            stage: stage.length > 0 ? stage : "local",
          })),
          Effect.runPromise
        );

        return Response.json(payload);
      },
    },
  },
});
