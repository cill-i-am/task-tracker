import assert from "node:assert/strict";
import test from "node:test";

import { createDevEnvironment } from "./dev.mjs";

test("adds a default Better Auth base URL for local portless dev", () => {
  const env = createDevEnvironment({
    PATH: process.env.PATH ?? "",
    PORTLESS_PORT: "1355",
  });

  assert.equal(env.BETTER_AUTH_BASE_URL, "https://api.task-tracker.localhost:1355");
});

test("preserves an explicit Better Auth base URL override", () => {
  const env = createDevEnvironment({
    BETTER_AUTH_BASE_URL: "https://custom-auth.example.com",
    PATH: process.env.PATH ?? "",
    PORTLESS_PORT: "1355",
  });

  assert.equal(env.BETTER_AUTH_BASE_URL, "https://custom-auth.example.com");
});
