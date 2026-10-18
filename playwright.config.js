import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:4173";

export default defineConfig({
  testMatch: "**/*.e2e.js",
  workers: 2,
  use: {
    baseURL,
    channel: "chrome",
    viewport: { width: 1280, height: 900 },
    launchOptions: {
      args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"],
    },
  },
  projects: [
    {
      name: "desktop",
      testIgnore: ["**/mobile.e2e.js", "**/*.mobile.e2e.js"],
      use: {
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: "@mobile",
      testMatch: ["**/mobile.e2e.js", "**/*.mobile.e2e.js"],
      use: {
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
  webServer: {
    command: "node scripts/dev/serve.mjs --port 4173",
    url: baseURL,
    reuseExistingServer: true,
  },
});
