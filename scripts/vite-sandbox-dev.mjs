import { spawn } from "node:child_process"
import { pathToFileURL } from "node:url"

export function runViteSandboxDev() {
  const viteCommand = process.platform === "win32" ? "vite.cmd" : "vite"
  const args = [
    "dev",
    "--port",
    process.env.PORT ?? "3000",
    "--strictPort",
    "--host",
    process.env.HOST ?? "0.0.0.0",
    "--clearScreen",
    "false",
  ]

  const child = spawn(viteCommand, args, {
    stdio: "inherit",
    env: process.env,
  })

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      child.kill(signal)
    })
  }

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }

    process.exit(code ?? 0)
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runViteSandboxDev()
}
