import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect } from "effect";

import { configWithoutCloudflareBootstrapSecrets } from "./stages.contract.ts";
import {
  loadInfraStageConfig,
  makeAlchemyStageIdentity,
  resourceName,
  stageResourceName,
} from "./stages.ts";

describe("Alchemy stage identity", () => {
  it("treats main as the production stage and protected Neon branch", () => {
    const identity = makeAlchemyStageIdentity({
      appName: "ceird",
      stage: "main",
    });

    expect(identity).toStrictEqual({
      appName: "ceird",
      isProduction: true,
      neonBranchName: "main",
      stage: "main",
      stageSlug: "main",
    });
    expect(stageResourceName(identity, "api")).toBe("ceird-main-api");
  });

  it("normalizes branch-shaped stages for Cloudflare and Neon names", () => {
    const identity = makeAlchemyStageIdentity({
      appName: "ceird",
      stage: "codex/Alchemy V2 Native Migration!",
    });

    expect(identity).toMatchObject({
      isProduction: false,
      neonBranchName: "codex-alchemy-v2-native-migration",
      stage: "codex/Alchemy V2 Native Migration!",
      stageSlug: "codex-alchemy-v2-native-migration",
    });
    expect(stageResourceName(identity, "auth_email")).toBe(
      "ceird-codex-alchemy-v2-native-migration-auth-email"
    );
  });

  it("adds a deterministic hash when truncating long stage names", () => {
    const first = makeAlchemyStageIdentity({
      appName: "ceird",
      stage: "feature/this-stage-name-is-way-too-long-for-provider-names",
    });
    const second = makeAlchemyStageIdentity({
      appName: "ceird",
      stage: "feature/this-stage-name-is-way-too-long-for-provider-names",
    });

    expect(first.stageSlug.length).toBeLessThanOrEqual(40);
    expect(first.stageSlug).toMatch(
      /^feature-this-stage-name-is-way-[a-f0-9]{8}$/
    );
    expect(second.stageSlug).toBe(first.stageSlug);
  });

  it("keeps the legacy resourceName helper on the normalized stage path", () => {
    expect(
      resourceName(
        {
          ...configWithoutCloudflareBootstrapSecrets,
          stage: "preview",
        },
        "api"
      )
    ).toBe("ceird-preview-api");
  });

  it("loads config for an explicit Alchemy stage without CEIRD_INFRA_STAGE", () => {
    const config = Effect.runSync(
      loadInfraStageConfig("dev_cillian").pipe(
        Effect.provide(ConfigProvider.layer(makeConfigProvider()))
      )
    );

    expect(config.stage).toBe("dev_cillian");
    expect(config.appHostname).toBe("app.example.com");
    expect(config.apiHostname).toBe("api.example.com");
    expect(config.neonDatabaseName).toBe("ceird");
    expect(config.neonDefaultBranchName).toBe("base");
    expect(config.neonParentBranchName).toBe("main");
    expect(config.neonParentStage).toBe("main");
    expect(config.neonPgVersion).toBe(17);
    expect(config.neonRegion).toBe("aws-eu-west-2");
    expect(resourceName(config, "api")).toBe("ceird-dev-cillian-api");
  });
});

function makeConfigProvider() {
  return ConfigProvider.fromEnv({
    env: {
      AUTH_EMAIL_FROM: "no-reply@example.com",
      CEIRD_ZONE_NAME: "example.com",
      GOOGLE_MAPS_API_KEY: "google-key",
    },
  });
}
