import { createFileRoute } from "@tanstack/react-router";
import { makeHealthPayloadFromSandboxIdInput } from "@task-tracker/sandbox-core";

export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: () =>
        Response.json(
          makeHealthPayloadFromSandboxIdInput("app", process.env.SANDBOX_ID)
        ),
    },
  },
});
