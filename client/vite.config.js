import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Khi dev, request /api sẽ được chuyển tới backend chạy cổng 3000
      "/api": "http://localhost:3000",
    },
  },
  build: {
    outDir: "dist",
  },
});
