import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const packageNames = [
  "@rollup/rollup-linux-x64-gnu",
  "lightningcss-linux-x64-gnu",
];

if (process.platform !== "linux" || process.arch !== "x64") {
  console.log("Linux native packages not needed on this platform.");
  process.exit(0);
}

const require = createRequire(import.meta.url);
const lockfile = readFileSync("pnpm-lock.yaml", "utf8");

for (const packageName of packageNames) {
  ensureNativePackage(packageName);
}

ensureEsbuildNativePackages();

function ensureNativePackage(packageName) {
  try {
    const resolved = require.resolve(packageName);
    console.log(`${packageName} already available at ${resolved}.`);
    return;
  } catch {
    // Continue and repair the optional dependency below.
  }

  const version = findLockedVersion(packageName);
  const targetDirectory = join("node_modules", ...packageName.split("/"));

  extractPackage(packageName, version, targetDirectory);

  const resolved = execFileSync(
    process.execPath,
    [
      "-e",
      `process.stdout.write(require.resolve(${JSON.stringify(packageName)}))`,
    ],
    { encoding: "utf8" }
  );
  console.log(`Installed ${packageName} at ${resolved}.`);
}

function ensureEsbuildNativePackages() {
  const pnpmVirtualStore = join("node_modules", ".pnpm");
  const entries = readdirSync(pnpmVirtualStore, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("esbuild@")) {
      continue;
    }

    const esbuildPackageDirectory = join(
      pnpmVirtualStore,
      entry.name,
      "node_modules",
      "esbuild"
    );
    const packageJsonPath = join(esbuildPackageDirectory, "package.json");

    if (!existsSync(packageJsonPath)) {
      continue;
    }

    const { version } = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    const packageName = "@esbuild/linux-x64";
    const targetDirectory = join(
      pnpmVirtualStore,
      entry.name,
      "node_modules",
      ...packageName.split("/")
    );
    const binaryPath = join(targetDirectory, "bin", "esbuild");

    if (existsSync(binaryPath)) {
      console.log(
        `${packageName}@${version} already available for ${entry.name}.`
      );
    } else {
      extractPackage(packageName, version, targetDirectory);
      console.log(`Installed ${packageName}@${version} for ${entry.name}.`);
    }

    const installedVersion = execFileSync(binaryPath, ["--version"], {
      encoding: "utf8",
    }).trim();

    if (installedVersion !== version) {
      throw new Error(
        `${binaryPath} reported ${installedVersion}, expected ${version}.`
      );
    }
  }
}

function extractPackage(packageName, version, targetDirectory) {
  const tempDirectory = mkdtempSync(join(tmpdir(), "native-package-"));

  try {
    const packOutput = execFileSync(
      "npm",
      [
        "pack",
        `${packageName}@${version}`,
        "--pack-destination",
        tempDirectory,
        "--silent",
      ],
      { encoding: "utf8" }
    );
    const tarballName = packOutput.trim().split(/\r?\n/).at(-1);

    if (!tarballName) {
      throw new Error(
        `npm pack produced no tarball for ${packageName}@${version}.`
      );
    }

    mkdirSync(targetDirectory, { recursive: true });
    execFileSync("tar", [
      "-xzf",
      join(tempDirectory, tarballName),
      "-C",
      targetDirectory,
      "--strip-components=1",
    ]);
  } finally {
    rmSync(tempDirectory, { force: true, recursive: true });
  }
}

function findLockedVersion(packageName) {
  const escapedPackageName = packageName.replaceAll(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
  const version = lockfile.match(
    new RegExp(`^ {2}'?${escapedPackageName}@([^:'"]+)'?:`, "m")
  )?.[1];

  if (!version) {
    throw new Error(
      `Could not determine ${packageName} version from pnpm-lock.yaml.`
    );
  }

  return version;
}
