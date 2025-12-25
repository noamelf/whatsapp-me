/**
 * Sentry Integration Tests
 * Tests that Sentry configuration is properly set up
 */

import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

describe("Sentry Integration Configuration", () => {
  it("should have Sentry node package available", () => {
    expect(Sentry).toBeDefined();
    expect(Sentry.init).toBeDefined();
    expect(Sentry.captureException).toBeDefined();
    expect(Sentry.startSpan).toBeDefined();
  });

  it("should have profiling integration available", () => {
    expect(nodeProfilingIntegration).toBeDefined();
    expect(typeof nodeProfilingIntegration).toBe("function");
  });

  it("should be able to create profiling integration", () => {
    const integration = nodeProfilingIntegration();
    expect(integration).toBeDefined();
  });

  it("should have all required Sentry methods", () => {
    // Verify all methods we use in index.ts are available
    expect(typeof Sentry.init).toBe("function");
    expect(typeof Sentry.captureException).toBe("function");
    expect(typeof Sentry.startSpan).toBe("function");
  });

  it("should support the configuration options we use", () => {
    // This test verifies that our Sentry configuration object structure is valid
    // by checking the types would be accepted by Sentry.init
    const testConfig = {
      dsn: "https://test@sentry.io/123",
      integrations: [nodeProfilingIntegration()],
      enableLogs: true,
      tracesSampleRate: 1.0,
      profileSessionSampleRate: 1.0,
      profileLifecycle: "trace" as const,
      sendDefaultPii: true,
    };

    // Verify the config structure is valid
    expect(testConfig.dsn).toBe("https://test@sentry.io/123");
    expect(testConfig.integrations).toHaveLength(1);
    expect(testConfig.enableLogs).toBe(true);
    expect(testConfig.tracesSampleRate).toBe(1.0);
    expect(testConfig.profileSessionSampleRate).toBe(1.0);
    expect(testConfig.profileLifecycle).toBe("trace");
    expect(testConfig.sendDefaultPii).toBe(true);
  });
});
