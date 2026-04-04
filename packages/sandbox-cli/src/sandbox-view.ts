export interface SandboxViewUrls {
  readonly app: string;
  readonly api: string;
  readonly postgres: string;
  readonly fallbackApp: string;
  readonly fallbackApi: string;
}

export interface SandboxStartupReadiness {
  readonly postgres: boolean;
  readonly api: boolean;
  readonly app: boolean;
}

export interface SandboxContainerNames {
  readonly app: string;
  readonly api: string;
  readonly postgres: string;
}

export function formatSandboxViewLines(
  label: string,
  hostnameSlug: string,
  urls: SandboxViewUrls
): readonly string[] {
  return [
    label,
    `  slug: ${hostnameSlug}`,
    `  app url: ${urls.app}`,
    `  api url: ${urls.api}`,
    `  postgres url: ${urls.postgres}`,
    `  app fallback url: ${urls.fallbackApp}`,
    `  api fallback url: ${urls.fallbackApi}`,
  ];
}

export function formatSandboxStartupTimeoutLines(input: {
  readonly hostnameSlug: string;
  readonly timeoutMs: number;
  readonly readiness: SandboxStartupReadiness;
  readonly containers: SandboxContainerNames;
  readonly urls: SandboxViewUrls;
}): readonly string[] {
  let nextContainer = input.containers.app;
  if (input.readiness.postgres === false) {
    nextContainer = input.containers.postgres;
  } else if (input.readiness.api === false) {
    nextContainer = input.containers.api;
  }

  return [
    `Sandbox startup timed out after ${Math.round(input.timeoutMs / 1000)} seconds.`,
    `  slug: ${input.hostnameSlug}`,
    `  postgres ready: ${input.readiness.postgres ? "yes" : "no"}`,
    `  api ready: ${input.readiness.api ? "yes" : "no"}`,
    `  app ready: ${input.readiness.app ? "yes" : "no"}`,
    `  postgres url: ${input.urls.postgres}`,
    `  app fallback url: ${input.urls.fallbackApp}`,
    `  api fallback url: ${input.urls.fallbackApi}`,
    `  next step: docker logs ${nextContainer}`,
  ];
}
