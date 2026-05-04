import { spawnSync } from "node:child_process";

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function main() {
  const rawArgs = process.argv.slice(2);
  const apiOnly = rawArgs[0] === "--api";
  const testArgs = stripSeparator(apiOnly ? rawArgs.slice(1) : rawArgs);

  runPnpm(["sandbox:up"]);

  const sandboxUrls = capturePnpm([
    "--silent",
    "sandbox:url",
    "--",
    "--format",
    "json",
  ]);
  const postgresUrl = parsePostgresUrl(sandboxUrls);
  const testCommand = apiOnly
    ? ["--filter", "api", "test", ...asScriptArgs(testArgs)]
    : ["test", ...asScriptArgs(testArgs)];

  runPnpm(testCommand, {
    API_TEST_DATABASE_URL: postgresUrl,
  });
}

function runPnpm(args, extraEnvironment = {}) {
  const result = spawnSync("pnpm", args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...extraEnvironment,
    },
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function capturePnpm(args) {
  const result = spawnSync("pnpm", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result.stdout;
}

function parsePostgresUrl(output) {
  let payload;

  try {
    payload = JSON.parse(output);
  } catch {
    throw new Error(
      `Unable to parse sandbox:url JSON output. Received: ${output.trim()}`
    );
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("urls" in payload) ||
    typeof payload.urls !== "object" ||
    payload.urls === null ||
    !("postgres" in payload.urls) ||
    typeof payload.urls.postgres !== "string"
  ) {
    throw new Error("Sandbox URL output did not include urls.postgres.");
  }

  return payload.urls.postgres;
}

function stripSeparator(args) {
  return args[0] === "--" ? args.slice(1) : args;
}

function asScriptArgs(args) {
  return args.length === 0 ? [] : ["--", ...args];
}
