import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  envDir: resolve(import.meta.dirname, ".."),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  // Dev same-origin: FE gọi /api/v1 → backend Go (không cần CORS).
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:5198",
        changeOrigin: true,
      },
    },
  },
})
