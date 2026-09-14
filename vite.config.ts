import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      // Hand-written worker (src/sw.ts): same precache + SPA fallback as the
      // generated one, plus Background Sync for the Pathways dataset.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      includeAssets: ["favicon.ico", "pwa-icon-192.png", "pwa-icon-512.png", "pathways/icon.svg"],
      manifest: {
        name: "HAVEN — Women's Safety SOS",
        short_name: "HAVEN",
        description: "Emergency SOS alerts with audio, GPS & live tracking. Stay safe.",
        theme_color: "#DC2626",
        background_color: "#111318",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/pwa-icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/pwa-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      injectManifest: {
        // pathways/*.json is the generated service directory, precached so the
        // directory works offline after one visit. The OAuth navigation
        // denylist lives in src/sw.ts.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,jpg}", "pathways/*.json"],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
