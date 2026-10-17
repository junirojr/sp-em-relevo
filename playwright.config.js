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
  webServer: {
    command: "node scripts/dev/serve.mjs --port 4173",
    url: baseURL,
    reuseExistingServer: true,
  },
});
