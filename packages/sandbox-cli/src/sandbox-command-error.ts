import { Schema } from "effect";

export class SandboxCommandError extends Schema.TaggedError<SandboxCommandError>()(
  "SandboxCommandError",
  {
    command: Schema.Array(Schema.String),
    message: Schema.String,
    stderr: Schema.optional(Schema.String),
    exitCode: Schema.optional(Schema.Number),
  }
) {}
