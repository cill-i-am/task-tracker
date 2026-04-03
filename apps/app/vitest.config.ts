import { mergeConfig } from "vite";
import { defineConfig } from "vitest/config";

import appConfig from "./vite.config";

export default mergeConfig(
  appConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
    },
  })
);
