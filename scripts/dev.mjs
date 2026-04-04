import { spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { repairPortlessRoutesFile } from "./portless-state.mjs";

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

export function createDevEnvironment(baseEnvironment = process.env) {
  const proxyPort = baseEnvironment.PORTLESS_PORT ?? "1355";

  return {
    ...baseEnvironment,
    BETTER_AUTH_BASE_URL:
      baseEnvironment.BETTER_AUTH_BASE_URL ??
      `https://api.task-tracker.localhost:${proxyPort}`,
    PORTLESS_PORT: proxyPort,
  };
}

export function runDev() {
  const devEnvironment = createDevEnvironment();
  const proxyPort = devEnvironment.PORTLESS_PORT;

  repairPortlessRoutesFile();

  const startProxy = spawnSync(
    command,
    ["exec", "portless", "proxy", "start", "-p", proxyPort],
    {
      stdio: "inherit",
      env: devEnvironment,
    }
  );

  if (startProxy.status !== 0) {
    process.exit(startProxy.status ?? 1);
  }

  const devProcess = spawn(command, ["exec", "turbo", "run", "dev"], {
    stdio: "inherit",
    env: devEnvironment,
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      devProcess.kill(signal);
    });
  }

  devProcess.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runDev();
}
