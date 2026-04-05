import { Schema } from "effect";

export const SANDBOX_NOT_FOUND_ERROR_TAG =
  "@task-tracker/sandbox-cli/SandboxNotFoundError" as const;

export class SandboxNotFoundError extends Schema.TaggedError<SandboxNotFoundError>()(
  SANDBOX_NOT_FOUND_ERROR_TAG,
  {
    worktreePath: Schema.String,
    message: Schema.String,
  }
) {}
