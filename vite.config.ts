import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import vike from "vike/plugin";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  plugins: [
    vike(),
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Ordermailing",
        short_name: "Ordermailing",
        description: "Ordermailing dashboard",
        theme_color: "#1a1a1a",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: null,
        // Precache only the shell. Globbing every chunk made a first visit
        // download the whole app up front — including the ~800 kB ONNX runtime
        // behind the design editor — competing with the page actually being
        // loaded. Everything else is cached on demand below.
        globPatterns: ["**/*.{css,html,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: ({ request }: { request: Request }) => request.destination === "script",
            handler: "StaleWhileRevalidate",
            options: { cacheName: "app-scripts" },
          },
          {
            urlPattern: ({ request }: { request: Request }) => request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "app-images",
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
    sentryVitePlugin({
      sourcemaps: {
        disable: false,
      },
    }),
  ],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // vuedraggable's published entry is a UMD bundle whose `require("vue")`
      // resolves to Vue's full CJS build, pulling the ~180 kB template compiler
      // into the shared client chunk on every page. Its ESM source imports vue
      // normally, so bundling that keeps us on the runtime-only build.
      vuedraggable: "vuedraggable/src/vuedraggable.js",
    },
  },

  build: {
    sourcemap: true,
  },
});
