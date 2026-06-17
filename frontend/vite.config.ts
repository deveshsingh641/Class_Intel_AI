import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  // Ensure env vars from frontend/.env* are available to the config.
  // We load ALL keys (prefix = "") because server proxy settings are not limited to VITE_ vars.
  const env = loadEnv(mode, __dirname, "");

  const backendPort = env.BACKEND_PORT || process.env.BACKEND_PORT || "5001";
  const apiUrl = env.VITE_API_URL || process.env.VITE_API_URL;
  const proxyTarget = apiUrl || `http://127.0.0.1:${backendPort}`;

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
        "@shared": path.resolve(__dirname, "..", "backend", "shared"),
        "@assets": path.resolve(__dirname, "attached_assets"),
      },
    },
    root: path.resolve(__dirname),
    build: {
      outDir: path.resolve(__dirname, "dist"),
      emptyOutDir: true,
    },
    server: {
      host: "0.0.0.0",
      port: Number(env.PORT || env.FRONTEND_PORT || process.env.PORT || process.env.FRONTEND_PORT || 5173),
      strictPort: Boolean(env.PORT || env.FRONTEND_PORT || process.env.PORT || process.env.FRONTEND_PORT),
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
    },
  };
});
