import { defineConfig } from "vite";

export default defineConfig({
  root: "frontend",
  // Relative asset paths so the build works on GitHub Pages under /<repo>/ and on any static host.
  base: "./",
  build: { outDir: "../dist", emptyOutDir: true },
});
