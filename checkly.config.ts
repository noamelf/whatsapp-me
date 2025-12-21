import { defineConfig } from "checkly";

export default defineConfig({
  projectName: "WhatsApp Event Detection",
  logicalId: "whatsapp-me-monitoring",
  repoUrl: "https://github.com/berzniz/whatsapp-me",
  checks: {
    activated: true,
    muted: false,
    // Use a recent runtime. Adjust if your org requires a specific one.
    runtimeId: "2024.09",
    frequency: 10,
    locations: ["eu-west-1", "us-east-1"],
    tags: ["api", "test-message"],
    checkMatch: "**/__checks__/**/*.check.ts",
    ignoreDirectoriesMatch: [],
    browserChecks: {
      frequency: 10,
      testMatch: [],
    },
  },
  cli: {
    runLocation: "eu-west-1",
    retries: 0,
  },
});
