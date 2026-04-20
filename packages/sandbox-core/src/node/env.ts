import fs from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";

import { Effect, Schema } from "effect";

import { SharedSandboxEnvironment } from "../runtime-spec.js";
import type { SharedSandboxEnvironment as SharedSandboxEnvironmentType } from "../runtime-spec.js";

const ENV_FILES = [".env", ".env.local"] as const;

export const SANDBOX_ENVIRONMENT_ERROR_TAG =
  "@task-tracker/sandbox-core/SandboxEnvironmentError" as const;

export class SandboxEnvironmentError extends Schema.TaggedError<SandboxEnvironmentError>()(
  SANDBOX_ENVIRONMENT_ERROR_TAG,
  {
    message: Schema.String,
    missing: Schema.Array(Schema.String),
    filePath: Schema.optional(Schema.String),
  }
) {}

export const loadSandboxSharedEnvironment = Effect.fn(
  "SandboxEnv.loadSharedEnvironment"
)(function* (input: {
  readonly repoRoot: string;
  readonly requiredKeys: readonly string[];
  readonly processEnv?: Record<string, string | undefined>;
  readonly readFile?: (
    filePath: string
  ) => Effect.Effect<string, unknown, never>;
}) {
  const readFile = input.readFile ?? readEnvFile;
  const fileEnv: Record<string, string> = {};
  yield* Effect.annotateCurrentSpan("repoRoot", input.repoRoot);
  const envFileContents = yield* Effect.forEach(
    ENV_FILES,
    (relativePath) => {
      const filePath = path.join(input.repoRoot, relativePath);
      return readFile(filePath).pipe(
        Effect.catchAll((error) =>
          isMissingFileError(error)
            ? Effect.succeed("")
            : Effect.fail(
                new SandboxEnvironmentError({
                  message:
                    error instanceof Error
                      ? `Failed to read sandbox env file ${filePath}: ${error.message}`
                      : `Failed to read sandbox env file ${filePath}.`,
                  missing: [],
                  filePath,
                })
              )
        )
      );
    },
    { concurrency: "unbounded" }
  );

  for (const content of envFileContents) {
    Object.assign(fileEnv, parseEnvironmentFile(content));
  }

  const merged = {
    ...fileEnv,
    ...Object.fromEntries(
      Object.entries(input.processEnv ?? {}).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      )
    ),
  };

  const requiredEnvironment = Object.fromEntries(
    input.requiredKeys.map((key) => [key, merged[key]])
  );

  return yield* Schema.decodeUnknown(SharedSandboxEnvironment)(
    requiredEnvironment
  ).pipe(
    Effect.mapError(() => {
      const missing = input.requiredKeys.filter((key) => {
        const value = merged[key];

        return typeof value !== "string" || value.length === 0;
      });

      return new SandboxEnvironmentError({
        message:
          missing.length === 0
            ? "Sandbox shared env is invalid."
            : `Missing required sandbox env vars: ${missing.join(", ")}. Add them to .env or .env.local at the repo root, or export them in the shell before running the sandbox CLI.`,
        missing,
      });
    })
  );
});

const readEnvFile = Effect.fn("SandboxEnv.readFile")(function* (
  filePath: string
) {
  yield* Effect.annotateCurrentSpan("filePath", filePath);
  return yield* Effect.tryPromise({
    try: () => fs.readFile(filePath, "utf8"),
    catch: (error) => error,
  });
});

function parseEnvironmentFile(content: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(parseEnv(content)).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export type SharedSandboxEnvironmentInput = SharedSandboxEnvironmentType;
