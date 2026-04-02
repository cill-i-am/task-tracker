import { Schema } from "effect";

export class SandboxPreflightError extends Schema.TaggedError<SandboxPreflightError>()(
  "SandboxPreflightError",
  {
    message: Schema.String,
  }
) {}
