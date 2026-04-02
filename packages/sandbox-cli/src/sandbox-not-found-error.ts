import { Schema } from "effect";

export class SandboxNotFoundError extends Schema.TaggedError<SandboxNotFoundError>()(
  "SandboxNotFoundError",
  {
    worktreePath: Schema.String,
    message: Schema.String,
  }
) {}
