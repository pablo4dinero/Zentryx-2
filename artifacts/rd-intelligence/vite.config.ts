import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import legacy from "@vitejs/plugin-legacy";
import oklabFunction from "@csstools/postcss-oklab-function";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Transpiles the JS bundle for older browsers (Chrome 80+, Firefox 78+,
    // Safari 14+). Creates a separate legacy bundle served via <script nomodule>
    // so modern browsers continue loading the optimised ES-module build unchanged.
    legacy({
      targets: ["chrome >= 80", "firefox >= 78", "safari >= 14", "edge >= 80"],
      modernPolyfills: true,
    }),
    VitePWA({
      registerType: "prompt",
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
  css: {
    postcss: {
      plugins: [
        // Adds rgb() fallbacks before every oklch() value in the output CSS.
        // Tailwind v4 uses oklch exclusively; browsers older than Chrome 111 /
        // Firefox 113 / Safari 15.4 do not support it and would render
        // colourless (invisible) elements without these fallbacks.
        oklabFunction({ subFeatures: { displayP3: false } }),
      ],
    },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    // Raise the inline-asset threshold so small images aren't inlined as
    // base64 data URIs in the legacy bundle (they can exceed the 4 kB default).
    assetsInlineLimit: 4096,
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
