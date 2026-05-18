import { spawnSync } from "node:child_process";

const result = spawnSync("pnpm", ["exec", "lefthook", "install"], {
  stdio: "inherit",
  env: process.env,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
