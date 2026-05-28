import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "favicon.svg", "zentryx-icon.svg", "zentryx-icon-maskable.svg"],
      manifest: {
        name: "Zentryx — R&D Intelligence",
        short_name: "Zentryx",
        description: "Zentryx R&D Intelligence Suite — projects, planning, sales, and analytics in one workspace. v2",
        theme_color: "#7C4DFF",
        background_color: "#0B0B14",
        display: "standalone",
        display_override: ["window-controls-overlay", "standalone"],
        orientation: "any",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "/zentryx-icon.svg",          sizes: "any",   type: "image/svg+xml", purpose: "any" },
          { src: "/zentryx-icon-maskable.svg", sizes: "any",   type: "image/svg+xml", purpose: "maskable" },
          { src: "/favicon.png",               sizes: "80x83", type: "image/png",     purpose: "any" },
        ],
      },
      // Workbox-generated service worker — caches the built app shell so the
      // installed PWA opens instantly and updates in the background.
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        // Main bundle currently weighs ~2.4 MB; allow up to 6 MB so the SW
        // can precache it without failing the build.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      devOptions: {
        // Surface the install criteria during local dev too. Disable this if
        // you hit stale-asset weirdness while iterating.
        enabled: true,
        type: "module",
        navigateFallback: "/index.html",
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    host: "0.0.0.0",
    allowedHosts: true,
    hmr: { overlay: false },
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL || "http://localhost:3000",
        changeOrigin: true,
      },
      // WebSocket signaling hub for calls — ws:true upgrades the connection.
      "/ws": {
        target: process.env.VITE_API_URL || "http://localhost:3000",
        changeOrigin: true,
        ws: true,
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port: 5173,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
