import { defineConfig } from "vite-plus";
import { publishExt } from "./vite/publish-ext";

export default defineConfig({
  base: "./",
  publicDir: false,
  plugins: [publishExt()],
  server: { port: 5173 },
  preview: { port: 4173 },
  build: { sourcemap: false },
  fmt: {},
  lint: {
    ignorePatterns: ["dist/**"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 120_000,
  },
});
