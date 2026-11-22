import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Relative URLs keep assets working when Pages serves the app from a subpath.
  base: "./",
  root: "main-site",
  publicDir: "public",
  plugins: [
    VitePWA({
      registerType: "prompt",
      injectRegister: null,
      includeAssets: ["icons/app-icon.svg"],
      manifest: {
        name: "Joging - Private Route Tracker",
        short_name: "Joging",
        description: "Pelacak perjalanan pribadi dengan riwayat lokal dan jejak GPS saat perjalanan aktif.",
        start_url: "./",
        scope: "./",
        theme_color: "#e9f1f5",
        background_color: "#f4f7f8",
        display: "standalone",
        orientation: "portrait",
        icons: [
          {
            src: "icons/app-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{html,js,mjs,css,svg,png,ico,webmanifest}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true
      }
    })
  ],
  build: {
    outDir: "../dist",
    emptyOutDir: true
  }
});
