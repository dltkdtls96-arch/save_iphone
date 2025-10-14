// /project/workspace/vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",

      // public/ 아래 실제 존재하는 파일만 넣기
      includeAssets: [
        "favicon.svg",
        "robots.txt",
        "icons/apple-touch-icon.png",
        "icons/character03.png", // ← index.html에서 사용 중
      ],

      manifest: {
        name: "교번 캘린더",
        short_name: "교번",
        start_url: "/",
        display: "standalone",
        background_color: "#0f172a",
        theme_color: "#0ea5e9",

        // 지금은 apple-touch-icon만 확실히 있으니 이걸 아이콘으로 등록(임시)
        // 나중에 192/512, maskable 아이콘 만들면 아래 배열을 교체하세요.
        icons: [
          {
            src: "/icons/apple-touch-icon.png",
            sizes: "180x180",
            type: "image/png",
            purpose: "any", // 임시
          },
        ],
      },

      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico,txt,woff2}"],
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: /\/assets\/.*\.(?:png|jpg|jpeg|gif|webp|svg)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "assets-images",
              expiration: {
                maxEntries: 600,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
          {
            urlPattern: ({ request }) =>
              request.destination === "style" || request.destination === "font",
            handler: "StaleWhileRevalidate",
            options: { cacheName: "assets-external" },
          },
          {
            urlPattern: ({ request, url }) =>
              request.destination === "script" ||
              (request.destination === "style" &&
                url.origin !== self.location.origin),
            handler: "StaleWhileRevalidate",
            options: { cacheName: "external-cdn" },
          },
        ],
      },
    }),
  ],
});
