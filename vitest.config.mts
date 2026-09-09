import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
    maxWorkers: 2,
    restoreMocks: true,
    // Node 22+ exposes its own Web Storage; use the browser environment's storage in tests.
    execArgv: Number(process.versions.node.split(".")[0]) >= 22 ? ["--no-experimental-webstorage"] : [],
  },
});
