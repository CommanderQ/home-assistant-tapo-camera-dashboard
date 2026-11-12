import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const srcAlias = fileURLToPath(new URL("./src", import.meta.url));
const demoRoot = fileURLToPath(new URL("./demo", import.meta.url));
const distDemo = fileURLToPath(new URL("./dist-demo", import.meta.url));
const cardEntry = fileURLToPath(new URL("./src/tapo-c260-card.ts", import.meta.url));

export default defineConfig(({ mode }) => {
  const isDemo = mode === "demo";

  if (isDemo) {
    return {
      root: demoRoot,
      publicDir: false,
      server: {
        port: 5173,
        open: false,
        host: "127.0.0.1",
      },
      preview: {
        port: 4173,
        host: "127.0.0.1",
      },
      build: {
        outDir: distDemo,
        emptyOutDir: true,
      },
      resolve: {
        alias: {
          "@": srcAlias,
        },
      },
    };
  }

  return {
    root: rootDir,
    build: {
      lib: {
        entry: cardEntry,
        name: "TapoC260Card",
        formats: ["es"],
        fileName: () => "tapo-c260-card.js",
      },
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: true,
      target: "es2022",
      minify: true,
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
      },
    },
    resolve: {
      alias: {
        "@": srcAlias,
      },
    },
  };
});
