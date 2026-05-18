import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  extractPostgresConnectionUri,
  formatGitHubMaskCommand,
} from "./export-playwright-database-url.mjs";

const scriptPath = path.join(
  import.meta.dirname,
  "export-playwright-database-url.mjs"
);

test("extracts the redacted Postgres connection URI from Alchemy state", () => {
  assert.equal(
    extractPostgresConnectionUri({
      attr: {
        connectionUri: {
          __redacted__:
            "postgresql://ceird:secret@example.neon.tech/ceird?sslmode=require",
        },
      },
    }),
    "postgresql://ceird:secret@example.neon.tech/ceird?sslmode=require"
  );
});

test("extracts the plain Postgres connection URI from Alchemy state", () => {
  assert.equal(
    extractPostgresConnectionUri({
      attr: {
        connectionUri:
          "postgresql://ceird:secret@example.neon.tech/ceird?sslmode=require",
      },
    }),
    "postgresql://ceird:secret@example.neon.tech/ceird?sslmode=require"
  );
});

test("rejects state without a Postgres connection URI", () => {
  assert.throws(
    () => extractPostgresConnectionUri({ attr: {} }),
    /Alchemy PostgresBranch state did not include attr\.connectionUri/
  );
});

test("escapes GitHub workflow mask command values", () => {
  assert.equal(
    formatGitHubMaskCommand("postgresql://user:p%a\ns\r@example.com/db"),
    "::add-mask::postgresql://user:p%25a%0As%0D@example.com/db"
  );
});

test("CLI masks the URL and writes PLAYWRIGHT_DATABASE_URL to GITHUB_ENV", () => {
  const tempDirectory = mkdtempSync(
    path.join(tmpdir(), "ceird-playwright-db-url-")
  );
  const githubEnvPath = path.join(tempDirectory, "github-env");

  try {
    const state = {
      attr: {
        connectionUri: {
          __redacted__:
            "postgresql://ceird:secret@example.neon.tech/ceird?sslmode=require",
        },
      },
    };
    const result = spawnSync(process.execPath, [scriptPath], {
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_ENV: githubEnvPath,
      },
      input: JSON.stringify(state),
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.stdout,
      "::add-mask::postgresql://ceird:secret@example.neon.tech/ceird?sslmode=require\n"
    );
    assert.equal(result.stderr, "");
    assert.match(
      readFileSync(githubEnvPath, "utf8"),
      /PLAYWRIGHT_DATABASE_URL<<ceird_playwright_database_url_/
    );
    assert.match(
      readFileSync(githubEnvPath, "utf8"),
      /postgresql:\/\/ceird:secret@example\.neon\.tech\/ceird\?sslmode=require/
    );
  } finally {
    rmSync(tempDirectory, { force: true, recursive: true });
  }
});
