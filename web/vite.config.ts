import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * O backend Node.js puro serve `web/dist` em producao.
 * Em dev, o Vite roda em 5273 e faz proxy de /api e /ws para o servidor (5271).
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    port: 5273,
    strictPort: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:5271", changeOrigin: true },
      "/ws": { target: "ws://127.0.0.1:5271", ws: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
});
