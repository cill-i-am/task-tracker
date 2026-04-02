import { createFileRoute } from "@tanstack/react-router";
import { makeHealthPayload } from "@task-tracker/sandbox-core";

export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: () =>
        Response.json(
          makeHealthPayload("app", process.env.SANDBOX_ID ?? "local")
        ),
    },
  },
});
