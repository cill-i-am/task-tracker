#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const defaultEnvName = "PLAYWRIGHT_DATABASE_URL";
const redactedMarker = "__redacted__";
const envNamePattern = /^[A-Z_][A-Z0-9_]*$/;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readConnectionUriValue(value) {
  if (typeof value === "string") {
    return value;
  }

  if (isRecord(value) && typeof value[redactedMarker] === "string") {
    return value[redactedMarker];
  }
}

function assertPostgresUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Alchemy PostgresBranch connection URI is not a valid URL");
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error(
      "Alchemy PostgresBranch connection URI must use postgres:// or postgresql://"
    );
  }
}

export function extractPostgresConnectionUri(state) {
  const connectionUri = isRecord(state)
    ? readConnectionUriValue(state.attr?.connectionUri)
    : undefined;

  if (connectionUri === undefined) {
    throw new Error(
      "Alchemy PostgresBranch state did not include attr.connectionUri"
    );
  }

  assertPostgresUrl(connectionUri);
  return connectionUri;
}

function escapeWorkflowCommandValue(value) {
  return value
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}

export function formatGitHubMaskCommand(value) {
  return `::add-mask::${escapeWorkflowCommandValue(value)}`;
}

function appendGitHubEnvValue({ envFile, name, value }) {
  const delimiter = `ceird_playwright_database_url_${randomUUID().replaceAll(
    "-",
    "_"
  )}`;
  appendFileSync(envFile, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}

function parseArgs(args) {
  const envNameFlagIndex = args.indexOf("--env-name");
  const envName =
    envNameFlagIndex === -1
      ? defaultEnvName
      : (args[envNameFlagIndex + 1] ?? "");

  if (!envNamePattern.test(envName)) {
    throw new Error(
      "--env-name must be an uppercase GitHub Actions environment variable name"
    );
  }

  return { envName };
}

export function runCli({
  args = process.argv.slice(2),
  env = process.env,
  input = readFileSync(0, "utf8"),
  stdout = process.stdout,
} = {}) {
  const { envName } = parseArgs(args);
  const githubEnv = env.GITHUB_ENV;

  if (!githubEnv) {
    throw new Error("GITHUB_ENV is required so the database URL is not logged");
  }

  const state = JSON.parse(input);
  const databaseUrl = extractPostgresConnectionUri(state);

  stdout.write(`${formatGitHubMaskCommand(databaseUrl)}\n`);
  appendGitHubEnvValue({
    envFile: githubEnv,
    name: envName,
    value: databaseUrl,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
