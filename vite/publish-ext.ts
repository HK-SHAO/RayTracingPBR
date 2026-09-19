import type { Plugin } from "vite-plus";

export function publishExt(): Plugin {
  return {
    name: "publish-ext",
    apply: (_cfg, { command, mode }) => command === "build" && mode === "toy",
    config() {
      return {
        build: {
          rollupOptions: {
            output: {
              assetFileNames(asset) {
                const name = asset.names?.[0] ?? "";
                if (name.endsWith(".obj")) return "assets/[name]-[hash].data";
                return "assets/[name]-[hash][extname]";
              },
            },
          },
        },
      };
    },
  };
}
