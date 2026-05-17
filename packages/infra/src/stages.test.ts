import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect } from "effect";

import { loadInfraStageConfig } from "./stages.ts";

const baseEnvironment = new Map<string, string>([
  ["AUTH_EMAIL_FROM", "no-reply@example.com"],
  ["GOOGLE_MAPS_API_KEY", "google-key"],
  [
    "NEON_DATABASE_URL",
    "postgresql://app:secret@ep-white-field.eu-west-2.aws.neon.tech/ceird?sslmode=require",
  ],
  ["CEIRD_ZONE_NAME", "example.com"],
]);

describe("infra stage config", () => {
  it("defaults production Worker observability to sampled logs without invocation URLs", () => {
    const config = loadConfig();

    expect(config.workerInvocationLogsEnabled).toBe(false);
    expect(config.workerLogHeadSamplingRate).toBe(0.1);
    expect(config.workerTraceHeadSamplingRate).toBe(0.1);
  });

  it("keeps preview Worker sampling at full capture by default", () => {
    const config = loadConfig({
      CEIRD_INFRA_STAGE: "preview",
    });

    expect(config.workerInvocationLogsEnabled).toBe(false);
    expect(config.workerLogHeadSamplingRate).toBe(1);
    expect(config.workerTraceHeadSamplingRate).toBe(1);
  });

  it("loads Worker observability sampling rates from environment", () => {
    const config = loadConfig({
      CEIRD_WORKER_INVOCATION_LOGS_ENABLED: "true",
      CEIRD_WORKER_LOG_SAMPLE_RATE: "0.5",
      CEIRD_WORKER_TRACE_SAMPLE_RATE: "0.25",
    });

    expect(config.workerInvocationLogsEnabled).toBe(true);
    expect(config.workerLogHeadSamplingRate).toBe(0.5);
    expect(config.workerTraceHeadSamplingRate).toBe(0.25);
  });

  it("rejects Worker observability sampling rates outside 0..1", () => {
    expect(() =>
      loadConfig({
        CEIRD_WORKER_TRACE_SAMPLE_RATE: "1.25",
      })
    ).toThrow(/sampling rates/);
  });
});

function loadConfig(overrides: Record<string, string> = {}) {
  const config = new Map<string, string>([
    ...baseEnvironment,
    ...Object.entries(overrides),
  ]);

  return Effect.runSync(
    loadInfraStageConfig.pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown(Object.fromEntries(config))
      )
    )
  );
}
