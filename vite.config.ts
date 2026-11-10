// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// Never set ssr.external or resolve.external: the Worker has no runtime module resolution, so
// the build fails. Never add compression (compressPublicAssets, vite-plugin-compression):
// hosting already compresses at the edge.
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  plugins: [
    // Installable app with an offline shell. Registration happens only in src/lib/pwa.ts (guarded:
    // never in dev, the editor preview or iframes). The manifest lives in public/manifest.webmanifest.
    VitePWA({
      strategies: "generateSW",
      registerType: "autoUpdate",
      injectRegister: null,
      manifest: false,
      filename: "sw.js",
      // The browser files are published from dist/client, so the worker must be written there to be served at /sw.js.
      outDir: "dist/client",
      devOptions: { enabled: false },
      workbox: {
        // Only built, hashed files and public icons are precached. No API answers, chats, addresses or photos.
        globPatterns: ["assets/**/*.{js,css,woff2}", "icons/*.png", "favicon.ico", "manifest.webmanifest"],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            // Pages: always try the network first; the saved copy is used only when offline.
            urlPattern: ({ request, url }) =>
              request.mode === "navigate" &&
              url.origin === self.location.origin &&
              !url.pathname.startsWith("/~oauth") &&
              !url.pathname.startsWith("/api") &&
              !url.pathname.startsWith("/_serverFn"),
            handler: "NetworkFirst",
            options: {
              cacheName: "cheez-pages",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 30, maxAgeSeconds: 7 * 24 * 3600 },
            },
          },
        ],
      },
    }),
  ],
});
